"use client";

import { useMemo } from "react";
import type { ReactNode } from "react";
import type { Invoice, TaxSettings } from "@/lib/types";
import type { StatementDoc } from "@/lib/statement";
import { KIND_LABEL, pickStatements, summarizeProfit } from "@/lib/statement";
import { invoiceInsights, statementInsights, statementTrend } from "@/lib/insights";
import { fmtMoney, fmtNumber, fmtWan, monthLabel } from "@/lib/format";
import { periodLabel } from "@/lib/period";
import { Reveal } from "@/components/motion";
import {
  Columns,
  Donut,
  GroupedColumns,
  LineChart,
  RatioBars,
  StackedBars,
  Waterfall,
  grey,
} from "@/components/viz";

/* ==========================================================================
   小部件
   ========================================================================== */

function Stat({
  label,
  value,
  meta,
  delay = 0,
}: {
  label: string;
  value: string;
  meta?: string;
  delay?: number;
}) {
  return (
    <Reveal delay={delay}>
      <div className="card stat">
        <span className="stat__label">{label}</span>
        <b className="stat__value num">{value}</b>
        {meta && <span className="stat__meta">{meta}</span>}
      </div>
    </Reveal>
  );
}

function Panel({
  title,
  hint,
  right,
  children,
  delay = 0,
  span,
}: {
  title: string;
  hint?: string;
  right?: ReactNode;
  children: ReactNode;
  delay?: number;
  span?: boolean;
}) {
  return (
    <Reveal delay={delay}>
      <div className={`card viz-card ${span ? "viz-card--wide" : ""}`}>
        <div className="viz-card__head">
          <div>
            <h3 className="h3">{title}</h3>
            {hint && <p className="micro" style={{ marginTop: 6 }}>{hint}</p>}
          </div>
          {right}
        </div>
        <div className="viz-card__body">{children}</div>
      </div>
    </Reveal>
  );
}

const Empty = ({ text }: { text: string }) => <div className="empty">{text}</div>;

/* ==========================================================================
   一、发票侧：经营与税负看板
   —— 看「业务流量怎么走、税负落在哪」，与财报侧的结构视角刻意区分
   ========================================================================== */

export function InvoiceInsights({
  invoices,
  settings,
  period,
  dimension,
}: {
  invoices: Invoice[];
  settings: TaxSettings;
  period: string;
  dimension: "month" | "quarter" | "year";
}) {
  const data = useMemo(() => invoiceInsights(invoices, settings, period), [invoices, settings, period]);

  const labels = data.months.map((m) => monthLabel(m.month));
  const activeIdx = data.months.map((m, i) => (m.active ? i : -1)).filter((i) => i >= 0);

  const taxTrend = data.months.map((m) => m.taxTotal);
  const peak = data.scope.peak;

  return (
    <section className="section" id="insights">
      <div className="wrap">
        <div className="section__head">
          <div>
            <h2 className="h2">经营与税负看板</h2>
            <p className="sub" style={{ marginTop: 12 }}>
              趋势看流量怎么走，构成看税负落在哪 · 高亮列为本期（
              {periodLabel(period)}），税负按月含留抵推演
            </p>
          </div>
          {dimension !== "month" && (
            <span className="micro">期间为 {periodLabel(period)}，柱状与构成按月汇总</span>
          )}
        </div>

        <div className="grid grid--4" style={{ marginBottom: 20 }}>
          <Stat
            label="本期发票"
            value={`${data.scope.invoiceCount} 张`}
            meta={`平均 ${fmtMoney(data.scope.avgInvoice, 0)} / 张`}
          />
          <Stat
            label="销项不含税"
            value={fmtWan(data.scope.outputAmount)}
            meta={`进项 ${fmtWan(data.scope.inputAmount)} · 进销差 ${fmtWan(
              data.scope.outputAmount - data.scope.inputAmount,
            )}`}
            delay={60}
          />
          <Stat
            label="进项可抵扣率"
            value={`${data.scope.deductibleShare.toFixed(1)}%`}
            meta={`进项税额合计 ${fmtNumber(data.scope.inputTax, 0)} 元`}
            delay={120}
          />
          <Stat
            label="全期税费峰值"
            value={peak ? monthLabel(peak.month) : "—"}
            meta={
              peak
                ? `当月税费 ${fmtMoney(peak.tax, 0)}${peak.active ? "（本期）" : ""} · 本期月均税负率 ${data.scope.avgBurden.toFixed(2)}%`
                : "暂无"
            }
            delay={180}
          />
        </div>

        {data.months.length === 0 ? (
          <div className="card">
            <Empty text="本期没有发票数据" />
          </div>
        ) : (
          <>
            <Panel
              title="销项 / 进项税额逐月趋势"
              hint="单位：元 · 阴影列为本期。销项走高而进项跟不上，通常意味着增值税负担上升"
              span
            >
              <LineChart
                labels={labels}
                activeIndexes={activeIdx}
                series={[
                  { name: "销项税额", values: data.months.map((m) => m.outputTax), area: true, color: grey(0) },
                  { name: "可抵扣进项税额", values: data.months.map((m) => m.inputTax), color: grey(2) },
                ]}
                height={248}
              />
            </Panel>

            <div className="grid grid--2" style={{ marginTop: 20 }}>
              <Panel title="综合税负率趋势" hint="税费合计 ÷ 销项不含税收入" delay={60}>
                <LineChart
                  labels={labels}
                  activeIndexes={activeIdx}
                  series={[{ name: "综合税负率", values: data.months.map((m) => m.burdenRate), area: true, color: grey(0) }]}
                  axisFormat={(v) => `${v.toFixed(0)}%`}
                  valueFormat={(v) => v.toFixed(2)}
                  unit="%"
                  height={214}
                />
              </Panel>

              <Panel title="应纳增值税与期末留抵" hint="按逐月推演，进项大于销项时形成留抵" delay={120}>
                <LineChart
                  labels={labels}
                  activeIndexes={activeIdx}
                  series={[
                    { name: "应纳增值税", values: data.months.map((m) => m.vatPayable), area: true, color: grey(0) },
                    { name: "期末留抵", values: data.months.map((m) => m.closingCredit), color: grey(2) },
                  ]}
                  height={214}
                />
              </Panel>
            </div>

            <div className="grid grid--3" style={{ marginTop: 20 }}>
              <Panel title="销项税额构成" hint="按税率 · 本期" delay={60}>
                {data.outputTaxByRate.length ? (
                  <Donut
                    items={data.outputTaxByRate}
                    centerLabel="销项税额"
                    centerValue={fmtWan(data.outputTaxByRate.reduce((s, i) => s + i.value, 0))}
                  />
                ) : (
                  <Empty text="本期无销项税额" />
                )}
              </Panel>

              <Panel title="进项税额构成" hint="按税率 · 本期" delay={120}>
                {data.inputTaxByRate.length ? (
                  <Donut
                    items={data.inputTaxByRate}
                    centerLabel="进项税额"
                    centerValue={fmtWan(data.inputTaxByRate.reduce((s, i) => s + i.value, 0))}
                  />
                ) : (
                  <Empty text="本期无进项税额" />
                )}
              </Panel>

              <Panel title="票种结构" hint="专票 / 普票金额构成" delay={180}>
                <StackedBars
                  labels={["专票", "普票"]}
                  rows={data.kindStructure.map((k) => ({
                    label: `${k.label} · ${k.count} 张`,
                    parts: [k.special, k.ordinary],
                  }))}
                />
              </Panel>
            </div>

            <div className="grid grid--2" style={{ marginTop: 20 }}>
              <Panel title="客户集中度" hint="销项前 5 名客户，其余合并为「其他」" delay={60}>
                {data.topCustomers.length ? (
                  <Donut items={data.topCustomers} centerLabel="销项合计" centerValue={fmtWan(data.scope.outputAmount)} />
                ) : (
                  <Empty text="本期无销项发票" />
                )}
              </Panel>

              <Panel title="单票金额分布" hint="不含税金额分档 · 本期张数" delay={120}>
                <Columns
                  items={data.sizeBuckets.map((b) => ({ label: b.label, value: b.count }))}
                  valueFormat={(n) => `${fmtNumber(n, 0)}`}
                  height={232}
                />
              </Panel>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/* ==========================================================================
   二、报表侧：财务结构看板
   —— 看「钱从哪来、花到哪去、赚得多不多」，与发票侧的流量视角不同
   ========================================================================== */

export function StatementInsights({ docs, period }: { docs: StatementDoc[]; period: string }) {
  const bundle = useMemo(() => pickStatements(docs, period), [docs, period]);
  const data = useMemo(() => statementInsights(bundle), [bundle]);
  const trend = useMemo(() => statementTrend(docs), [docs]);

  const anyDoc = bundle.profit || bundle.balance || bundle.cashflow;
  if (!anyDoc) return null;

  const p = bundle.profit ? summarizeProfit(bundle.profit) : null;
  const b = bundle.balance?.items ?? {};
  const c = bundle.cashflow?.items ?? {};
  const yoyRevenue = data.yoy?.rows.find((r) => r.label === "营业收入");
  const yoyGrowth =
    yoyRevenue && yoyRevenue.prior > 0
      ? ((yoyRevenue.current - yoyRevenue.prior) / yoyRevenue.prior) * 100
      : null;

  const balancePct = data.balance?.ratios.find((r) => r.label === "资产负债率");

  return (
    <section className="section" id="fin-insights">
      <div className="wrap">
        <div className="section__head">
          <div>
            <h2 className="h2">财务结构看板</h2>
            <p className="sub" style={{ marginTop: 12 }}>
              与发票看板取不同维度：这里看利润形成路径、成本费用去向与资产资金结构
            </p>
          </div>
          <span className="micro">
            {[
              bundle.profit && KIND_LABEL.profit,
              bundle.balance && KIND_LABEL.balance,
              bundle.cashflow && KIND_LABEL.cashflow,
            ]
              .filter(Boolean)
              .join(" · ")}
            {period ? ` · 归入 ${periodLabel(period)}` : ""}
          </span>
        </div>

        <div className="grid grid--4" style={{ marginBottom: 20 }}>
          <Stat
            label="营业收入"
            value={p ? fmtWan(p.revenue) : "—"}
            meta={
              yoyGrowth !== null
                ? `较上期 ${yoyGrowth >= 0 ? "增长" : "下降"} ${Math.abs(yoyGrowth).toFixed(1)}%`
                : p
                  ? `营业成本 ${fmtWan(p.cost)}`
                  : "未导入利润表"
            }
          />
          <Stat
            label="利润总额"
            value={p ? fmtWan(p.totalProfit) : "—"}
            meta={
              p && p.revenue > 0
                ? `利润率 ${((p.totalProfit / p.revenue) * 100).toFixed(1)}% · 净利 ${
                    p.netProfit !== undefined ? fmtWan(p.netProfit) : "未列示"
                  }`
                : "未导入利润表"
            }
            delay={60}
          />
          <Stat
            label="资产总计"
            value={b.totalAssets ? fmtWan(Number(b.totalAssets)) : "—"}
            meta={
              balancePct
                ? `资产负债率 ${balancePct.value.toFixed(1)}% · 权益 ${
                    b.totalEquity ? fmtWan(Number(b.totalEquity)) : "—"
                  }`
                : "未导入资产负债表"
            }
            delay={120}
          />
          <Stat
            label="经营现金流净额"
            value={c.operatingNet !== undefined ? fmtWan(Number(c.operatingNet)) : "—"}
            meta={
              c.netIncrease !== undefined
                ? `现金净增加 ${fmtWan(Number(c.netIncrease))} · 期末 ${
                    c.endingCash !== undefined ? fmtWan(Number(c.endingCash)) : "—"
                  }`
                : "未导入现金流量表"
            }
            delay={180}
          />
        </div>

        {data.profit && (
          <>
            <Panel
              title="利润形成路径"
              hint="营业收入出发，逐项扣减成本费用，看每一环吃掉多少利润"
              span
            >
              <Waterfall steps={data.profit.waterfall} height={288} />
            </Panel>

            <div className="grid grid--2" style={{ marginTop: 20 }}>
              <Panel title="成本费用构成" hint="营业成本、税金及附加与四项期间费用" delay={60}>
                {data.profit.costComposition.length ? (
                  <Donut
                    items={data.profit.costComposition}
                    centerLabel="成本费用"
                    centerValue={fmtWan(data.profit.costComposition.reduce((s, i) => s + i.value, 0))}
                  />
                ) : (
                  <Empty text="本期没有成本费用数据" />
                )}
              </Panel>

              <Panel title="盈利质量" hint="利润率类指标，标注「留意」的项需要关注" delay={120}>
                <RatioBars items={data.profit.ratios} />
              </Panel>
            </div>
          </>
        )}

        {data.balance && (
          <div className="grid grid--2" style={{ marginTop: 20 }}>
            <Panel title="资产结构" hint="资产如何分布，现金与存货占比反映流动性" delay={60}>
              {data.balance.assetComposition.length ? (
                <Donut
                  items={data.balance.assetComposition}
                  centerLabel="资产总计"
                  centerValue={fmtWan(Number(b.totalAssets ?? 0))}
                />
              ) : (
                <Empty text="资产负债表里没有可用的资产科目" />
              )}
            </Panel>

            <Panel title="资金来源与偿债能力" hint="负债与权益构成，以及短期偿债指标" delay={120}>
              <StackedBars
                labels={["流动负债", "非流动负债", "所有者权益"]}
                rows={[
                  {
                    label: "资金构成",
                    parts: [
                      data.balance.fundingComposition.find((f) => f.name === "流动负债")?.value ?? 0,
                      data.balance.fundingComposition.find((f) => f.name === "非流动负债")?.value ?? 0,
                      data.balance.fundingComposition.find((f) => f.name === "所有者权益")?.value ?? 0,
                    ],
                  },
                ]}
              />
              <div className="viz-split" style={{ marginTop: 18 }}>
                <RatioBars
                  items={data.balance.ratios.filter((r) => ["资产负债率", "净资产占比"].includes(r.label))}
                />
                <RatioBars
                  items={data.balance.ratios.filter((r) =>
                    ["流动比率", "速动比率", "存货占流动资产"].includes(r.label),
                  )}
                />
              </div>
            </Panel>
          </div>
        )}

        {data.cashflow && (
          <div className="grid grid--2" style={{ marginTop: 20 }}>
            <Panel title="三大活动现金流净额" hint="正为流入、负为流出；经营为正通常说明主营业务能造血" delay={60}>
              {data.cashflow.bars.length ? (
                <Columns
                  items={data.cashflow.bars.map((x) => ({ label: x.label, value: x.value }))}
                  height={236}
                />
              ) : (
                <Empty text="现金流量表里没有可用的活动净额" />
              )}
            </Panel>

            <Panel title="现金流构成" hint="经营活动的流入与流出各由什么构成" delay={120}>
              {data.cashflow.inflow.length || data.cashflow.outflow.length ? (
                <div className="viz-split viz-split--col">
                  {data.cashflow.inflow.length > 0 && (
                    <div>
                      <p className="micro" style={{ marginBottom: 8 }}>流入构成</p>
                      <StackedBars
                        labels={data.cashflow.inflow.map((i) => i.name)}
                        rows={[{ label: "经营活动", parts: data.cashflow.inflow.map((i) => i.value) }]}
                      />
                    </div>
                  )}
                  {data.cashflow.outflow.length > 0 && (
                    <div>
                      <p className="micro" style={{ marginBottom: 8 }}>流出构成</p>
                      <StackedBars
                        labels={data.cashflow.outflow.map((i) => i.name)}
                        rows={[{ label: "经营活动", parts: data.cashflow.outflow.map((i) => i.value) }]}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <Empty text="现金流量表里没有可用的流入流出明细" />
              )}
            </Panel>
          </div>
        )}

        {(trend || data.yoy) && (
          <div className={`grid ${trend && data.yoy ? "grid--2" : ""}`} style={{ marginTop: 20 }}>
            {trend && (
              <Panel
                title={trend.title}
                hint="同一张表导入多个期间才会出现；单位：元"
                delay={60}
              >
                <LineChart
                  labels={trend.labels}
                  series={trend.series.map((s, i) => ({
                    name: s.name,
                    values: s.values,
                    color: grey(i === 0 ? 0 : i * 2),
                    area: i === 0,
                  }))}
                  height={252}
                />
              </Panel>
            )}

            {data.yoy && (
              <Panel
                title={data.yoy.title}
                hint={`取自报表的其它口径列（${data.yoy.unit}主科目）`}
                delay={120}
              >
                <GroupedColumns
                  rows={data.yoy.rows}
                  currentLabel={data.yoy.title.split(" vs ")[0]}
                  priorLabel={data.yoy.title.split(" vs ")[1] ?? "上期"}
                  height={252}
                />
              </Panel>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
