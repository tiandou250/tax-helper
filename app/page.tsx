"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Nav } from "@/components/nav";
import { CountUp, Reveal } from "@/components/motion";
import { MeterList, MonthlyBars, RateStack, TaxBars } from "@/components/charts";
import { InvoiceTable, TaxTable } from "@/components/tables";
import { InvoiceModal } from "@/components/modals";
import { SettingsPanel } from "@/components/settings";
import { ImportPanel } from "@/components/import-panel";
import { BackToTop, ScrollProgress } from "@/components/scroll";
import { DEFAULT_SETTINGS, type Invoice, type TaxSettings } from "@/lib/types";
import {
  computeTax,
  creditLedger,
  groupBy,
  groupByMonth,
  groupByRate,
  inPeriod,
  periodLabel,
  periodOptions,
  type PeriodKind,
} from "@/lib/tax";
import {
  exportInvoiceCsv,
  exportKindCsv,
  exportNamedCsv,
  exportRateCsv,
  exportWorkbook,
} from "@/lib/report";
import { fmtMoney, fmtNumber, directionLabel, kindLabel } from "@/lib/format";

const LS = {
  invoices: "piaoshui.invoices.v2",
  settings: "piaoshui.settings.v2",
  period: "piaoshui.period.v2",
  dimension: "piaoshui.dim.v2",
};

const DIM_LABEL: Record<PeriodKind, string> = { month: "按月", quarter: "按季", year: "按年" };

function periodText(p: string, kind: PeriodKind) {
  if (!p) return "";
  if (kind === "month") return `${p.slice(0, 4)} 年 ${Number(p.slice(5, 7))} 月`;
  return periodLabel(p);
}

function PeriodBar({
  dimension,
  periods,
  value,
  onDimension,
  onChange,
}: {
  dimension: PeriodKind;
  periods: string[];
  value: string;
  onDimension: (d: PeriodKind) => void;
  onChange: (p: string) => void;
}) {
  return (
    <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
      <div className="seg">
        {(["month", "quarter", "year"] as PeriodKind[]).map((d) => (
          <button
            key={d}
            className={`seg__item ${dimension === d ? "is-active" : ""}`}
            onClick={() => onDimension(d)}
          >
            {DIM_LABEL[d]}
          </button>
        ))}
      </div>
      <select
        className="select"
        style={{ width: 176 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {periods.map((p) => (
          <option key={p} value={p}>
            {periodText(p, dimension)}
          </option>
        ))}
      </select>
    </div>
  );
}

function Kpi({
  label,
  value,
  meta,
  strong,
}: {
  label: string;
  value: number;
  meta: string;
  strong?: boolean;
}) {
  return (
    <div className={`card card--hover ${strong ? "" : "card--outline"}`}>
      <div className="kpi__label">{label}</div>
      <div className="kpi__value">
        <CountUp value={value} format={(n) => fmtMoney(n, 0)} />
      </div>
      <div className="kpi__meta">{meta}</div>
    </div>
  );
}

function Accordion({
  title,
  hint,
  children,
  defaultOpen = false,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card card--outline acc">
      <button className="acc__head" onClick={() => setOpen((v) => !v)}>
        <span className="h3">{title}</span>
        <span className="micro">{open ? "收起" : hint ?? "展开"}</span>
      </button>
      <div className={`acc__body ${open ? "is-open" : ""}`}>
        <div className="acc__inner">{children}</div>
      </div>
    </div>
  );
}

const invKey = (i: Invoice) =>
  `${i.number || i.counterparty}|${i.date}|${i.total.toFixed(2)}`;

export default function Page() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [settings, setSettings] = useState<TaxSettings>(DEFAULT_SETTINGS);
  const [dimension, setDimension] = useState<PeriodKind>("month");
  const [period, setPeriod] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [dirFilter, setDirFilter] = useState<"all" | "output" | "input">("all");
  const [kindFilter, setKindFilter] = useState<"all" | "special" | "ordinary">("all");
  const [q, setQ] = useState("");
  const toastTimer = useRef<number | null>(null);

  /* ---------------- 本地存储 ---------------- */
  useEffect(() => {
    try {
      const rawSettings = localStorage.getItem(LS.settings);
      if (rawSettings) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(rawSettings) });

      const rawInvoices = localStorage.getItem(LS.invoices);
      if (rawInvoices) {
        const parsed = JSON.parse(rawInvoices);
        if (Array.isArray(parsed)) {
          // 迁移旧字段 deductible → checked，并清理早期示例数据
          const cleaned = parsed
            .filter((i: Invoice) => !String(i.id).startsWith("seed-"))
            .map((i: Invoice & { deductible?: boolean }) => ({
              ...i,
              checked: i.checked ?? i.deductible ?? i.kind === "special",
            }));
          setInvoices(cleaned);
        }
      }
      setDimension((localStorage.getItem(LS.dimension) as PeriodKind) || "month");
      setPeriod(localStorage.getItem(LS.period) || "");
    } catch {
      /* 忽略本地存储异常 */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS.invoices, JSON.stringify(invoices));
      localStorage.setItem(LS.settings, JSON.stringify(settings));
      localStorage.setItem(LS.dimension, dimension);
      if (period) localStorage.setItem(LS.period, period);
    } catch {
      /* 配额超限时静默降级 */
    }
  }, [invoices, settings, dimension, period, hydrated]);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2800);
  }, []);

  /* ---------------- 派生数据 ---------------- */
  const options = useMemo(() => periodOptions(invoices), [invoices]);
  const periods = options[dimension];
  const activePeriod = period && periods.includes(period) ? period : periods[0] ?? "";

  const periodInvoices = useMemo(
    () => invoices.filter((i) => inPeriod(i.date, activePeriod)),
    [invoices, activePeriod],
  );
  const result = useMemo(
    () => computeTax(invoices, settings, activePeriod),
    [invoices, settings, activePeriod],
  );
  const trend = useMemo(() => groupByMonth(invoices), [invoices]);
  const rateBuckets = useMemo(() => groupByRate(periodInvoices), [periodInvoices]);
  const categories = useMemo(() => groupBy(periodInvoices, (i) => i.category, 6), [periodInvoices]);
  const parties = useMemo(
    () => groupBy(periodInvoices, (i) => i.counterparty || "未填写", 6),
    [periodInvoices],
  );
  const ledger = useMemo(() => creditLedger(invoices, settings), [invoices, settings]);

  const periodAmount = result.outputAmount + result.inputAmount;
  const specialTotal = rateBuckets.reduce((s, b) => s + b.specialAmount, 0);
  const ordinaryTotal = rateBuckets.reduce((s, b) => s + b.ordinaryAmount, 0);

  const byKind = useMemo(() => {
    const rows: { label: string; amount: number; tax: number; count: number }[] = [];
    for (const dir of ["output", "input"] as const) {
      for (const kind of ["special", "ordinary"] as const) {
        const list = periodInvoices.filter((i) => i.direction === dir && i.kind === kind);
        rows.push({
          label: `${directionLabel(dir)}${kindLabel(kind)}`,
          amount: list.reduce((s, i) => s + i.amount, 0),
          tax: list.reduce((s, i) => s + i.tax, 0),
          count: list.length,
        });
      }
    }
    return rows;
  }, [periodInvoices]);

  const viewInvoices = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return periodInvoices
      .filter((i) => (dirFilter === "all" ? true : i.direction === dirFilter))
      .filter((i) => (kindFilter === "all" ? true : i.kind === kindFilter))
      .filter((i) =>
        kw ? [i.counterparty, i.category, i.number].join(" ").toLowerCase().includes(kw) : true,
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [periodInvoices, dirFilter, kindFilter, q]);

  /* ---------------- 操作 ---------------- */
  const addInvoices = (list: Invoice[]) => {
    const stamp = Date.now();
    const seen = new Set(invoices.map(invKey));
    const fresh: Invoice[] = [];
    let dup = 0;
    list.forEach((item, idx) => {
      const key = invKey(item);
      if (seen.has(key)) {
        dup += 1;
        return;
      }
      seen.add(key);
      fresh.push({ ...item, id: `${stamp}-${idx}` });
    });
    setInvoices((prev) => [...fresh, ...prev]);
    notify(dup > 0 ? `导入 ${fresh.length} 张，跳过 ${dup} 张重复发票` : `已导入 ${fresh.length} 张发票`);

    const target = list
      .map((i) => i.date.slice(0, 7))
      .filter(Boolean)
      .sort()
      .pop();
    if (target) {
      if (dimension === "month") setPeriod(target);
      else if (dimension === "quarter")
        setPeriod(`${target.slice(0, 4)}-Q${Math.ceil(Number(target.slice(5, 7)) / 3)}`);
      else setPeriod(target.slice(0, 4));
    }
  };

  const toggleChecked = (id: string) =>
    setInvoices((prev) => prev.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)));

  const removeInvoice = (id: string) => {
    setInvoices((prev) => prev.filter((i) => i.id !== id));
    notify("已移除 1 张发票");
  };

  const saveInvoice = (inv: Invoice) => {
    setInvoices((prev) => {
      const exists = prev.some((i) => i.id === inv.id);
      return exists ? prev.map((i) => (i.id === inv.id ? inv : i)) : [inv, ...prev];
    });
    setShowForm(false);
    setEditing(null);
    notify("已保存");
  };

  const changeDimension = (d: PeriodKind) => {
    setDimension(d);
    const next = periodOptions(invoices)[d];
    setPeriod(next[0] ?? "");
  };

  const exportWorkbookFile = async () => {
    await exportWorkbook({
      invoices: viewInvoices.length ? viewInvoices : periodInvoices,
      settings,
      period: activePeriod,
      result,
      ledger,
      rates: rateBuckets,
      categories,
      parties,
      byKind,
    });
    notify("申报底稿已导出");
  };

  const hasData = invoices.length > 0;

  return (
    <div className="page-in" id="top">
      <ScrollProgress />
      <Nav hasData={hasData} />

      {/* ============ 导入 ============ */}
      <section className="section section--import" id="import">
        <div className="wrap">
          <Reveal>
            <ImportPanel
              onImport={addInvoices}
              onManual={() => {
                setEditing(null);
                setShowForm(true);
              }}
              companyName={settings.companyName}
            />
          </Reveal>

          {!hasData && (
            <Reveal delay={80}>
              <div className="guide">
                {[
                  ["01", "导入发票", "拖入 PDF / OFD / XML 原件或照片，支持多选批量识别。"],
                  ["02", "核对明细", "识别不确定的行会标「请核对」；进项专票默认已勾选。"],
                  ["03", "查看税金", "按月、季、年自动算出增值税、附加税费与所得税估算。"],
                ].map(([num, title, desc]) => (
                  <div className="guide__item" key={num}>
                    <span className="guide__num num">{num}</span>
                    <span className="guide__title">{title}</span>
                    <span className="micro">{desc}</span>
                  </div>
                ))}
              </div>
            </Reveal>
          )}
        </div>
      </section>

      {hasData && (
        <>
          {/* ============ 总览 ============ */}
          <section className="section" id="overview">
            <div className="wrap">
              <div className="section__head">
                <div>
                  <h2 className="h2">总览</h2>
                  <p className="sub" style={{ marginTop: 12 }}>
                    {periodText(activePeriod, dimension)} · {periodInvoices.length} 张发票 · 不含税合计{" "}
                    {fmtMoney(periodAmount, 0)}
                  </p>
                </div>
                <PeriodBar
                  dimension={dimension}
                  periods={periods}
                  value={activePeriod}
                  onDimension={changeDimension}
                  onChange={setPeriod}
                />
              </div>

              <div className="grid grid--4" style={{ marginBottom: 20 }}>
                <Reveal delay={0}>
                  <Kpi
                    label="销项税额"
                    value={result.outputTax}
                    meta={`销项不含税 ${fmtMoney(result.outputAmount, 0)}`}
                  />
                </Reveal>
                <Reveal delay={70}>
                  <Kpi
                    label="可抵扣进项税额"
                    value={result.inputTax}
                    meta={
                      result.inputTaxBlocked > 0
                        ? `另有 ${fmtMoney(result.inputTaxBlocked, 0)} 未抵扣`
                        : "进项全部已勾选抵扣"
                    }
                  />
                </Reveal>
                <Reveal delay={140}>
                  <Kpi
                    label="应纳增值税"
                    value={result.vatPayable}
                    meta={
                      settings.taxpayer === "general" && result.credit > 0
                        ? `期末留抵 ${fmtMoney(result.credit, 0)}`
                        : `附加税费 ${fmtMoney(result.surchargeTotal, 0)}`
                    }
                  />
                </Reveal>
                <Reveal delay={210}>
                  <Kpi
                    label="应缴税费合计"
                    value={result.total}
                    strong
                    meta={`综合税负率 ${result.effectiveRate.toFixed(2)}%`}
                  />
                </Reveal>
              </div>

              <div className="grid grid--sidebar">
                <Reveal>
                  <div className="card" style={{ height: "100%" }}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <h3 className="h3">进销项趋势</h3>
                      <div className="legend">
                        <span className="legend__item">
                          <i className="legend__dot" />
                          销项
                        </span>
                        <span className="legend__item">
                          <i className="legend__dot legend__dot--soft" />
                          进项
                        </span>
                      </div>
                    </div>
                    <MonthlyBars data={trend} />
                    <p className="micro" style={{ marginTop: 20 }}>
                      柱高为不含税金额，单位：元。数据来自全部月份的发票。
                    </p>
                  </div>
                </Reveal>

                <Reveal delay={90}>
                  <div
                    className="card"
                    style={{ height: "100%", display: "flex", flexDirection: "column" }}
                  >
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <h3 className="h3">税率结构</h3>
                      <div className="legend">
                        <span className="legend__item">
                          <i className="legend__dot" />
                          专票
                        </span>
                        <span className="legend__item">
                          <i className="legend__dot legend__dot--soft" />
                          普票
                        </span>
                      </div>
                    </div>
                    <p className="micro" style={{ marginTop: 8 }}>
                      不含税金额 · 单位：元
                    </p>
                    <RateStack data={rateBuckets} />
                    <div className="list" style={{ marginTop: "auto", paddingTop: 28 }}>
                      <div className="list__row">
                        <span className="micro">专票金额合计</span>
                        <span className="num" style={{ fontSize: 15 }}>
                          {fmtNumber(specialTotal, 0)}
                        </span>
                      </div>
                      <div className="list__row">
                        <span className="micro">普票金额合计</span>
                        <span className="num" style={{ fontSize: 15 }}>
                          {fmtNumber(ordinaryTotal, 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                </Reveal>
              </div>
            </div>
          </section>

          {/* ============ 明细 ============ */}
          <section className="section section--alt" id="invoices">
            <div className="wrap">
              <div className="section__head">
                <div>
                  <h2 className="h2">发票明细</h2>
                  <p className="sub" style={{ marginTop: 12 }}>
                    当前期间 {viewInvoices.length} 张 · 税额合计{" "}
                    {fmtMoney(periodInvoices.reduce((s, i) => s + i.tax, 0), 0)}
                  </p>
                </div>
                <div className="row">
                  <button className="btn btn--ghost" onClick={() => exportInvoiceCsv(viewInvoices, activePeriod)}>
                    导出明细
                  </button>
                  <button
                    className="btn btn--primary"
                    onClick={() => {
                      setEditing(null);
                      setShowForm(true);
                    }}
                  >
                    新增发票
                  </button>
                </div>
              </div>

              <div className="card card--flush">
                <div className="toolbar">
                  <div className="row row--wrap" style={{ gap: 12 }}>
                    <div className="seg">
                      {[
                        { v: "all", l: "全部" },
                        { v: "output", l: "销项" },
                        { v: "input", l: "进项" },
                      ].map((o) => (
                        <button
                          key={o.v}
                          className={`seg__item ${dirFilter === o.v ? "is-active" : ""}`}
                          onClick={() => setDirFilter(o.v as typeof dirFilter)}
                        >
                          {o.l}
                        </button>
                      ))}
                    </div>
                    <div className="seg">
                      {[
                        { v: "all", l: "全部票种" },
                        { v: "special", l: "专票" },
                        { v: "ordinary", l: "普票" },
                      ].map((o) => (
                        <button
                          key={o.v}
                          className={`seg__item ${kindFilter === o.v ? "is-active" : ""}`}
                          onClick={() => setKindFilter(o.v as typeof kindFilter)}
                        >
                          {o.l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    className="input toolbar__search"
                    placeholder="搜索对方单位或商品"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </div>

                <div style={{ borderTop: "1px solid var(--line-soft)" }}>
                  <InvoiceTable
                    invoices={viewInvoices}
                    onToggle={toggleChecked}
                    onEdit={(inv) => {
                      setEditing(inv);
                      setShowForm(true);
                    }}
                    onRemove={removeInvoice}
                  />
                </div>
              </div>
              <p className="micro" style={{ marginTop: 16 }}>
                进项专票默认已勾选抵扣，点击「已勾选」可切换；普通发票进项税额不得抵扣。
              </p>
            </div>
          </section>

          {/* ============ 分类汇总 ============ */}
          <section className="section" id="summary">
            <div className="wrap">
              <div className="section__head">
                <div>
                  <h2 className="h2">分类汇总</h2>
                  <p className="sub" style={{ marginTop: 12 }}>
                    按税率、票种、费用类别与往来单位拆分，每块可单独导出
                  </p>
                </div>
              </div>

              <div className="grid grid--2" style={{ marginBottom: 20 }}>
                <Reveal>
                  <div className="card card--hover" style={{ height: "100%" }}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <h3 className="h3">按税率</h3>
                      <button
                        className="btn--text"
                        onClick={() => exportRateCsv(rateBuckets, periodAmount, activePeriod)}
                      >
                        导出
                      </button>
                    </div>
                    <div className="table-scroll table-scroll--x" style={{ marginTop: 16 }}>
                      <table className="table table--mini">
                        <thead>
                          <tr>
                            <th>税率</th>
                            <th className="r">张数</th>
                            <th className="r">不含税金额</th>
                            <th className="r">税额</th>
                            <th className="r">占比</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rateBuckets.map((b) => (
                            <tr key={b.rate}>
                              <td className="nowrap">{b.rate}%</td>
                              <td className="r">{b.count}</td>
                              <td className="r">{fmtNumber(b.amount, 0)}</td>
                              <td className="r">{fmtNumber(b.tax, 0)}</td>
                              <td className="r">
                                {periodAmount > 0
                                  ? `${((b.amount / periodAmount) * 100).toFixed(1)}%`
                                  : "0%"}
                              </td>
                            </tr>
                          ))}
                          {rateBuckets.length === 0 && (
                            <tr>
                              <td colSpan={5}>
                                <span className="micro">暂无数据</span>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <p className="micro" style={{ marginTop: 16 }}>
                      专票 / 普票的税率拆分见上方「税率结构」。
                    </p>
                  </div>
                </Reveal>

                <Reveal delay={80}>
                  <div className="card card--hover" style={{ height: "100%" }}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <h3 className="h3">按票种</h3>
                      <button
                        className="btn--text"
                        onClick={() => exportKindCsv(byKind, activePeriod)}
                      >
                        导出
                      </button>
                    </div>
                    <div className="list" style={{ marginTop: 12 }}>
                      {byKind.map((r) => (
                        <div className="list__row" key={r.label}>
                          <span>
                            {r.label}
                            <span className="micro" style={{ marginLeft: 10 }}>
                              {r.count} 张
                            </span>
                          </span>
                          <span className="row" style={{ gap: 16, alignItems: "baseline" }}>
                            <span className="num" style={{ width: 96, textAlign: "right" }}>
                              {fmtNumber(r.amount, 0)}
                            </span>
                            <span className="micro" style={{ width: 104, textAlign: "right" }}>
                              税额 {fmtNumber(r.tax, 0)}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="micro" style={{ marginTop: 20 }}>
                      金额为不含税金额。进项普票通常不可抵扣，除农产品收购、通行费等特殊凭证。
                    </p>
                  </div>
                </Reveal>
              </div>

              <div className="grid grid--2">
                <Reveal>
                  <div className="card card--hover" style={{ height: "100%" }}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <h3 className="h3">按费用类别</h3>
                      <button
                        className="btn--text"
                        onClick={() =>
                          exportNamedCsv("按费用类别", categories, periodAmount, activePeriod)
                        }
                      >
                        导出
                      </button>
                    </div>
                    <MeterList
                      items={categories.map((c) => ({
                        name: c.name,
                        value: c.amount,
                        meta: `${c.count} 张 · 税额 ${fmtNumber(c.tax, 0)}`,
                      }))}
                      total={periodAmount}
                    />
                  </div>
                </Reveal>
                <Reveal delay={80}>
                  <div className="card card--hover" style={{ height: "100%" }}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <h3 className="h3">按往来单位</h3>
                      <button
                        className="btn--text"
                        onClick={() => exportNamedCsv("按往来单位", parties, periodAmount, activePeriod)}
                      >
                        导出
                      </button>
                    </div>
                    <MeterList
                      items={parties.map((p) => ({
                        name: p.name,
                        value: p.amount,
                        meta: [
                          `${p.count} 张`,
                          p.outputAmount > 0 ? `销项 ${fmtNumber(p.outputAmount, 0)}` : "",
                          p.inputAmount > 0 ? `进项 ${fmtNumber(p.inputAmount, 0)}` : "",
                        ]
                          .filter(Boolean)
                          .join(" · "),
                      }))}
                      total={periodAmount}
                    />
                  </div>
                </Reveal>
              </div>
            </div>
          </section>

          {/* ============ 税金 ============ */}
          <section className="section section--alt" id="tax">
            <div className="wrap">
              <div className="section__head">
                <div>
                  <h2 className="h2">应缴税费</h2>
                  <p className="sub" style={{ marginTop: 12 }}>
                    {periodText(activePeriod, dimension)} ·{" "}
                    {settings.taxpayer === "general" ? "一般纳税人" : "小规模纳税人"}口径 · 共{" "}
                    {result.lines.length} 个税种
                  </p>
                </div>
                <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
                  <button className="btn btn--ghost" onClick={exportWorkbookFile}>
                    导出申报底稿
                  </button>
                  <PeriodBar
                    dimension={dimension}
                    periods={periods}
                    value={activePeriod}
                    onDimension={changeDimension}
                    onChange={setPeriod}
                  />
                </div>
              </div>

              <div className="grid grid--sidebar grid--top">
                <Reveal>
                  <div className="card card--flush">
                    <div style={{ padding: "24px 28px 4px" }}>
                      <h3 className="h3">税种明细</h3>
                      <p className="micro" style={{ marginTop: 8 }}>
                        计税基数与税额逐项列出，单位：元
                      </p>
                    </div>
                    <TaxTable lines={result.lines} />
                  </div>
                </Reveal>

                <Reveal delay={90}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    <div className="card">
                      <div className="kpi__label">应缴税费合计</div>
                      <div className="kpi__value kpi__value--xl">
                        <CountUp value={result.total} format={(n) => fmtMoney(n, 0)} />
                      </div>
                      <div className="kpi__meta" style={{ marginTop: 16 }}>
                        综合税负率 {result.effectiveRate.toFixed(2)}%（税费合计 ÷ 销项不含税收入）
                      </div>
                      <div className="list" style={{ marginTop: 20 }}>
                        <div className="list__row">
                          <span className="micro">增值税</span>
                          <span className="num">{fmtNumber(result.vatPayable)}</span>
                        </div>
                        <div className="list__row">
                          <span className="micro">附加税费</span>
                          <span className="num">{fmtNumber(result.surchargeTotal)}</span>
                        </div>
                        <div className="list__row">
                          <span className="micro">印花税</span>
                          <span className="num">{fmtNumber(result.stampDuty)}</span>
                        </div>
                        <div className="list__row">
                          <span className="micro">企业所得税（估算）</span>
                          <span className="num">{fmtNumber(result.incomeTax)}</span>
                        </div>
                        {result.otherTaxes > 0 && (
                          <div className="list__row">
                            <span className="micro">其他税费</span>
                            <span className="num">{fmtNumber(result.otherTaxes)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="card">
                      <h3 className="h3">计税说明</h3>
                      <ul className="note-list" style={{ marginTop: 16 }}>
                        {result.notes.map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </Reveal>
              </div>

              <Reveal delay={60}>
                <div className="card" style={{ marginTop: 20 }}>
                  <div className="row" style={{ justifyContent: "space-between", marginBottom: 20 }}>
                    <h3 className="h3">税负构成</h3>
                    <span className="micro">单位：元</span>
                  </div>
                  <TaxBars lines={result.lines} />
                </div>
              </Reveal>

              {settings.taxpayer === "general" && ledger.length > 0 && (
                <Reveal delay={80}>
                  <div className="card card--flush" style={{ marginTop: 20 }}>
                    <div className="row" style={{ padding: "24px 28px 4px", justifyContent: "space-between" }}>
                      <div>
                        <h3 className="h3">留抵税额台账</h3>
                        <p className="micro" style={{ marginTop: 8 }}>
                          按月推演，期初承接上期期末留抵
                        </p>
                      </div>
                      <span className="micro scroll-hint">可左右滑动</span>
                    </div>
                    <div className="table-scroll table-scroll--x">
                      <table className="table table--tax">
                        <thead>
                          <tr>
                            <th>月份</th>
                            <th className="r">销项税额</th>
                            <th className="r">可抵扣进项</th>
                            <th className="r">期初留抵</th>
                            <th className="r">应纳增值税</th>
                            <th className="r">期末留抵</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ledger.map((row) => (
                            <tr key={row.month} className={row.closing > 0 ? "table__row--credit" : ""}>
                              <td className="nowrap">{row.month}</td>
                              <td className="r">{fmtNumber(row.outputTax, 0)}</td>
                              <td className="r">{fmtNumber(row.inputTax, 0)}</td>
                              <td className="r">{fmtNumber(row.opening, 0)}</td>
                              <td className="r">{fmtNumber(row.payable, 0)}</td>
                              <td className="r cell-strong">
                                {fmtNumber(row.closing, 0)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </Reveal>
              )}
            </div>
          </section>

          {/* ============ 参数 ============ */}
          <section className="section" id="params">
            <div className="wrap">
              <div className="section__head">
                <div>
                  <h2 className="h2">计算参数</h2>
                  <p className="sub" style={{ marginTop: 12 }}>
                    调整后全部结果实时重算，参数保存在本机
                  </p>
                </div>
              </div>

              <Reveal>
                <div className="card card--pad-lg">
                  <SettingsPanel
                    settings={settings}
                    onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))}
                  />
                </div>
              </Reveal>

              <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 20 }}>
                <Reveal delay={60}>
                  <Accordion title="计算口径" hint="展开查看">
                    <div className="grid grid--2" style={{ gap: 24 }}>
                      <div>
                        <p className="body">增值税（一般纳税人）</p>
                        <p className="micro" style={{ marginTop: 8, lineHeight: 1.7 }}>
                          应纳增值税 = 销项税额 − 可抵扣进项税额 − 期初留抵税额。进项税额只统计「已勾选」的专票，负数结转下期留抵。
                        </p>
                      </div>
                      <div>
                        <p className="body">附加税费</p>
                        <p className="micro" style={{ marginTop: 8, lineHeight: 1.7 }}>
                          城建税、教育费附加、地方教育附加以实际缴纳的增值税为计税依据，税率 7% / 5% / 1%、3%、2%，小型微利企业减半。
                        </p>
                      </div>
                      <div>
                        <p className="body">印花税</p>
                        <p className="micro" style={{ marginTop: 8, lineHeight: 1.7 }}>
                          买卖合同按不含税价款万分之三计征，以进销项合同金额合计为基数。
                        </p>
                      </div>
                      <div>
                        <p className="body">企业所得税</p>
                        <p className="micro" style={{ marginTop: 8, lineHeight: 1.7 }}>
                          以收入减成本、期间费用、税金及附加后的利润总额估算，小型微利企业适用 5% 实际税负，未考虑纳税调整。
                        </p>
                      </div>
                    </div>
                  </Accordion>
                </Reveal>

                <Reveal delay={100}>
                  <Accordion title="数据与合规说明" hint="展开查看">
                    <div className="warn-box">
                      本工具用于内部测算与核对，不构成税务意见，实际申报请以电子税务局数据与主管税务机关口径为准。
                      发票数据仅保存在本机浏览器，清除浏览器数据会一并删除，建议定期导出 CSV 备份。
                      消费税、房产税、城镇土地使用税、个人所得税代扣代缴等请在「其他税费」手工填列。
                    </div>
                  </Accordion>
                </Reveal>
              </div>
            </div>
          </section>
        </>
      )}

      <footer className="footer">
        <div className="wrap footer__inner">
          <span>
            发票与税负工作台 · 数据保存在本机浏览器
            {hasData ? ` · 共 ${invoices.length} 张发票` : ""}
          </span>
          <span className="row" style={{ gap: 16 }}>
            {hasData && (
              <button
                className="btn--text"
                onClick={() => {
                  setInvoices([]);
                  setPeriod("");
                  notify("已清空全部发票");
                }}
              >
                清空全部发票
              </button>
            )}
            <a className="btn--text" href="#top" style={{ fontSize: 15 }}>
              回到顶部
            </a>
          </span>
        </div>
      </footer>

      {showForm && (
        <InvoiceModal
          initial={editing ?? undefined}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSave={saveInvoice}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
      <BackToTop />
    </div>
  );
}
