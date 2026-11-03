"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Nav, type ModuleKey } from "@/components/nav";
import { CountUp, Reveal } from "@/components/motion";
import { MeterList, MonthlyBars, RateStack, TaxBars } from "@/components/charts";
import { InvoiceTable, TaxTable } from "@/components/tables";
import { InvoiceModal } from "@/components/modals";
import { SettingsPanel } from "@/components/settings";
import { ImportPanel } from "@/components/import-panel";
import { StatementAnalysis, StatementImport } from "@/components/statements";
import { ClearDialog } from "@/components/confirm";
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
import {
  LEGACY,
  SS,
  clearAllKeys,
  clearBusinessKeys,
  migrateLegacy,
  purgeLegacy,
  readSSString,
  removeSS,
  writeSS,
} from "@/lib/storage";
import { pickStatements, reconcile, type StatementDoc } from "@/lib/statement";

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
  const [statements, setStatements] = useState<StatementDoc[]>([]);
  const [settings, setSettings] = useState<TaxSettings>(DEFAULT_SETTINGS);
  const [dimension, setDimension] = useState<PeriodKind>("month");
  const [period, setPeriod] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showClear, setShowClear] = useState(false);
  const [module, setModule] = useState<ModuleKey>("invoice");
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [dirFilter, setDirFilter] = useState<"all" | "output" | "input">("all");
  const [kindFilter, setKindFilter] = useState<"all" | "special" | "ordinary">("all");
  const [projectFilter, setProjectFilter] = useState("");
  const [q, setQ] = useState("");
  const toastTimer = useRef<number | null>(null);

  /* ---------------- 会话级存储 ---------------- */
  // 数据只存在 sessionStorage：刷新不丢，关闭标签页由浏览器清除，不写磁盘。
  useEffect(() => {
    try {
      const inv = migrateLegacy<Invoice[]>(SS.invoices, LEGACY.invoices, []);
      const st = migrateLegacy<StatementDoc[]>(SS.statements, LEGACY.statements, []);
      const set = migrateLegacy<TaxSettings | null>(SS.settings, LEGACY.settings, null);

      if (Array.isArray(inv.value) && inv.value.length) {
        // 迁移旧字段 deductible → checked，清理早期示例数据，并剔除结构不完整的记录
        const cleaned = inv.value
          .filter(
            (i) =>
              i &&
              typeof i.date === "string" &&
              typeof i.total === "number" &&
              isFinite(i.total) &&
              !String(i?.id).startsWith("seed-"),
          )
          .map((i) => ({
            ...i,
            checked: i.checked ?? (i as Invoice & { deductible?: boolean }).deductible ?? i.kind === "special",
          }));
        setInvoices(cleaned);
      }
      if (Array.isArray(st.value) && st.value.length) setStatements(st.value);
      if (set.value && typeof set.value === "object") setSettings({ ...DEFAULT_SETTINGS, ...set.value });

      const dim = readSSString(SS.dimension);
      setDimension(dim === "quarter" || dim === "year" ? dim : "month");
      setPeriod(readSSString(SS.period) || "");

      // 立刻清掉旧版本留在磁盘上的数据
      purgeLegacy();
    } catch {
      /* 存储异常时按空数据启动 */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    // 空数据不落键：清空后连键名都不留
    const put = (key: string, value: unknown) => {
      const empty = value === "" || value === null || value === undefined || (Array.isArray(value) && value.length === 0);
      if (empty) removeSS(key);
      else writeSS(key, value);
    };
    put(SS.invoices, invoices);
    put(SS.statements, statements);
    put(SS.settings, settings);
    put(SS.dimension, dimension);
    put(SS.period, period);
  }, [invoices, statements, settings, dimension, period, hydrated]);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2800);
  }, []);

  /* ---------------- 派生数据 ---------------- */
  const options = useMemo(
    () => periodOptions(invoices, statements.map((s) => s.period).filter(Boolean)),
    [invoices, statements],
  );
  const periods = options[dimension];
  const activePeriod = period && periods.includes(period) ? period : periods[0] ?? "";

  /** 当前期间对应的三张报表 */
  const currentStatements = useMemo(
    () => pickStatements(statements, activePeriod),
    [statements, activePeriod],
  );

  const periodInvoices = useMemo(
    () => invoices.filter((i) => inPeriod(i.date, activePeriod)),
    [invoices, activePeriod],
  );
  const result = useMemo(
    () => computeTax(invoices, settings, activePeriod, currentStatements),
    [invoices, settings, activePeriod, currentStatements],
  );
  const diffs = useMemo(
    () =>
      reconcile(currentStatements, {
        outputAmount: result.outputAmount,
        inputAmount: result.inputAmount,
        outputTax: result.outputTax,
        inputTax: result.inputTax,
        vatPayable: result.vatPayable,
        surchargeTotal: result.surchargeTotal,
        stampDuty: result.stampDuty,
        total: result.total,
      }),
    [currentStatements, result],
  );
  const trend = useMemo(() => groupByMonth(invoices), [invoices]);
  const rateBuckets = useMemo(() => groupByRate(periodInvoices), [periodInvoices]);
  const categories = useMemo(() => groupBy(periodInvoices, (i) => i.category, 8), [periodInvoices]);
  const parties = useMemo(
    () => groupBy(periodInvoices, (i) => i.counterparty || "未填写", 6),
    [periodInvoices],
  );
  const ledger = useMemo(() => creditLedger(invoices, settings), [invoices, settings]);

  const periodAmount = result.outputAmount + result.inputAmount;
  const specialTotal = rateBuckets.reduce((s, b) => s + b.specialAmount, 0);
  const ordinaryTotal = rateBuckets.reduce((s, b) => s + b.ordinaryAmount, 0);

  /* 按发票项目（票面商品/服务名）聚合 */
  const projectOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of periodInvoices) {
      const key = i.category || "未分类";
      map.set(key, (map.get(key) ?? 0) + i.amount);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [periodInvoices]);

  const activeProject = projectFilter && projectOptions.includes(projectFilter) ? projectFilter : "";

  const projectStats = useMemo(() => {
    if (!activeProject) return null;
    const list = periodInvoices.filter((i) => (i.category || "未分类") === activeProject);
    const amount = list.reduce((s, i) => s + i.amount, 0);
    return {
      count: list.length,
      amount,
      tax: list.reduce((s, i) => s + i.tax, 0),
      inputCount: list.filter((i) => i.direction === "input").length,
      outputCount: list.filter((i) => i.direction === "output").length,
      share: periodAmount > 0 ? (amount / periodAmount) * 100 : 0,
    };
  }, [activeProject, periodInvoices, periodAmount]);

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
      .filter((i) => (activeProject ? (i.category || "未分类") === activeProject : true))
      .filter((i) =>
        kw ? [i.counterparty, i.category, i.number].join(" ").toLowerCase().includes(kw) : true,
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [periodInvoices, dirFilter, kindFilter, activeProject, q]);

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
    const next = periodOptions(invoices, statements.map((s) => s.period).filter(Boolean))[d];
    setPeriod(next[0] ?? "");
  };

  /* ---------------- 财务报表 ---------------- */
  const addStatements = (list: StatementDoc[]) => {
    const stamp = Date.now();
    // 没识别到期间的，归入当前期间（再不行用本月），保证能被 pickStatements 精确命中
    const fallback = activePeriod || new Date().toISOString().slice(0, 7);
    const normalized = list.map((d, i) => ({
      ...d,
      period: d.period || fallback,
      id: `${stamp}-${i}`,
    }));
    // 同一类型 + 同一期间只保留一份（一个 xlsx 常同时有「资产负债表」和「未重分类」版）
    const seen = new Set<string>();
    const unique = normalized.filter((d) => {
      const k = `${d.kind}|${d.period}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const dropped = normalized.length - unique.length;

    setStatements((prev) => {
      const keys = new Set(unique.map((d) => `${d.kind}|${d.period}`));
      return [...unique, ...prev.filter((d) => !keys.has(`${d.kind}|${d.period}`))];
    });
    const kinds = [...new Set(unique.map((d) => d.kind))].length;
    notify(
      dropped > 0
        ? `已导入 ${unique.length} 份报表（${kinds} 类），跳过 ${dropped} 份同期间重复表`
        : `已导入 ${unique.length} 份报表（${kinds} 类）`,
    );
    const p = normalized.find((d) => d.period)?.period;
    if (p) {
      if (dimension === "month") setPeriod(p);
      else if (dimension === "quarter") setPeriod(`${p.slice(0, 4)}-Q${Math.ceil(Number(p.slice(5, 7)) / 3)}`);
      else setPeriod(p.slice(0, 4));
    }
  };

  const removeStatement = (id: string) => {
    setStatements((prev) => prev.filter((d) => d.id !== id));
    notify("已移除 1 份报表");
  };

  const changeStatementPeriod = (id: string, p: string) =>
    setStatements((prev) => prev.map((d) => (d.id === id ? { ...d, period: p.trim() } : d)));

  /** 切换取数口径（期末数 / 本年累计…），金额整表替换 */
  const changeStatementVariant = (id: string, label: string) =>
    setStatements((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        const v = d.variants?.find((x) => x.label === label);
        return v ? { ...d, variantLabel: v.label, items: v.items } : d;
      }),
    );

  /* ---------------- 清空 ---------------- */
  const clearBusiness = () => {
    setInvoices([]);
    setStatements([]);
    setPeriod("");
    setProjectFilter("");
    setQ("");
    clearBusinessKeys();
    setShowClear(false);
    notify("已清空发票与报表");
  };

  const clearAll = () => {
    setInvoices([]);
    setStatements([]);
    setSettings(DEFAULT_SETTINGS);
    setPeriod("");
    setDimension("month");
    setProjectFilter("");
    setQ("");
    clearAllKeys();
    setShowClear(false);
    notify("已全部重置");
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
      statements: Object.values(currentStatements).filter(Boolean) as StatementDoc[],
    });
    notify("申报底稿已导出");
  };

  const hasData = invoices.length > 0 || statements.length > 0;

  return (
    <div className="page-in" id="top">
      <ScrollProgress />
      <Nav
        module={module}
        onChange={setModule}
        counts={{
          invoice: invoices.length,
          statement: statements.length,
          tax: result.lines.length,
        }}
      />

      <div className="workspace">
        {/* ---------------- 左栏：当前模块的输入区 ---------------- */}
        <aside className="pane-aside">
          {module === "invoice" && (
            <div id="import">
              <ImportPanel
                onImport={addInvoices}
                onManual={() => {
                  setEditing(null);
                  setShowForm(true);
                }}
                onClear={() => setShowClear(true)}
                hasData={invoices.length > 0 || statements.length > 0}
                companyName={settings.companyName}
              />
              {!hasData && (
                <div className="guide guide--aside">
                  {[
                    ["01", "导入发票", "PDF / OFD / XML / 照片，可多选批量识别。"],
                    ["02", "核对明细", "识别不确定的行会标「请核对」。"],
                    ["03", "看税金", "切到「税金测算」，按期间算增值税与附加税。"],
                  ].map(([num, title, desc]) => (
                    <div className="guide__item" key={num}>
                      <span className="guide__num num">{num}</span>
                      <span className="guide__title">{title}</span>
                      <span className="micro">{desc}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {module === "statement" && (
            <div id="statement-import">
            <StatementImport
              docs={statements}
              period={activePeriod}
              onImport={addStatements}
              onRemove={removeStatement}
              onPeriodChange={changeStatementPeriod}
              onVariantChange={changeStatementVariant}
              notify={notify}
            />
            </div>
          )}

          {module === "tax" && (
            <div className="card card--aside">
              <h2 className="h3">税金测算</h2>
              <p className="micro" style={{ marginTop: 8 }}>
                {periodText(activePeriod, dimension)} ·{" "}
                {settings.taxpayer === "general" ? "一般纳税人" : "小规模纳税人"}
              </p>
              <div className="row" style={{ gap: 12, marginTop: 16, flexWrap: "wrap" }}>
                <PeriodBar
                  dimension={dimension}
                  periods={periods}
                  value={activePeriod}
                  onDimension={changeDimension}
                  onChange={setPeriod}
                />
              </div>
              <button
                className="btn btn--primary"
                style={{ marginTop: 16, width: "100%" }}
                onClick={exportWorkbookFile}
              >
                导出申报底稿
              </button>
              <p className="micro" style={{ marginTop: 12, lineHeight: 1.7 }}>
                底稿含发票明细、分类汇总、税金测算、留抵台账；已导入报表时一并附上三张报表。
              </p>
            </div>
          )}
        </aside>

        {/* ---------------- 右栏：当前模块的结果区 ---------------- */}
        <div className="pane-main">
                    {module === "invoice" && (
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
            </>
          )}

                    {module === "invoice" && (
            <>
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
                    <select
                      className="select toolbar__project"
                      value={activeProject}
                      onChange={(e) => setProjectFilter(e.target.value)}
                      title="按发票项目筛选"
                    >
                      <option value="">全部项目</option>
                      {projectOptions.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    className="input toolbar__search"
                    placeholder="搜索对方单位或商品"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </div>

                {projectStats && (
                  <div className="project-bar">
                    <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
                      <span className="body" style={{ fontWeight: 600 }}>
                        {activeProject}
                      </span>
                      <span className="tag">
                        进项 {projectStats.inputCount} 张 · 销项 {projectStats.outputCount} 张
                      </span>
                      <button className="btn--text" onClick={() => setProjectFilter("")}>
                        取消筛选
                      </button>
                    </div>
                    <span className="micro num">
                      不含税 {fmtMoney(projectStats.amount, 0)} · 税额 {fmtMoney(projectStats.tax, 0)} · 占本期{" "}
                      {projectStats.share.toFixed(1)}%
                    </span>
                  </div>
                )}

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
            </>
          )}

                    {module === "invoice" && (
            <>
{/* ============ 分类汇总 ============ */}
          <section className="section" id="summary">
            <div className="wrap">
              <div className="section__head">
                <div>
                  <h2 className="h2">分类汇总</h2>
                  <p className="sub" style={{ marginTop: 12 }}>
                    按税率、票种、发票项目与往来单位拆分，每块可单独导出
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
                      <h3 className="h3">按发票项目</h3>
                      <button
                        className="btn--text"
                        onClick={() =>
                          exportNamedCsv("按发票项目", categories, periodAmount, activePeriod)
                        }
                      >
                        导出
                      </button>
                    </div>
                    <p className="micro" style={{ marginTop: 8 }}>
                      取票面商品 / 服务名称，点击任一行可在明细中筛该项目
                    </p>
                    <MeterList
                      items={categories.map((c) => ({
                        name: c.name,
                        value: c.amount,
                        meta: `${c.count} 张 · 税额 ${fmtNumber(c.tax, 0)}`,
                      }))}
                      total={periodAmount}
                      onPick={(name) => {
                        setProjectFilter(name);
                        document.getElementById("invoices")?.scrollIntoView({ behavior: "smooth" });
                      }}
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
            </>
          )}

                    {module === "statement" && (
            <section className="section" id="statements">
              <div className="wrap">
                <StatementAnalysis
                  docs={statements}
                  activePeriod={activePeriod}
                  tax={result}
                  diffs={diffs}
                />
              </div>
            </section>
          )}

                    {module === "tax" && (
            <>
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
            </>
          )}

                    {module === "tax" && (
            <>
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
                          导入利润表后按账簿「利润总额」× 税率计算；未导入时退回「收入 − 成本 − 期间费用 − 税金」估算。小型微利企业适用 5% 实际税负，不含纳税调整。
                        </p>
                      </div>
                    </div>
                  </Accordion>
                </Reveal>

                <Reveal delay={100}>
                  <Accordion title="数据与合规说明" hint="展开查看">
                    <div className="warn-box">
                      本工具用于内部测算与核对，不构成税务意见，实际申报请以电子税务局数据与主管税务机关口径为准。
                      数据只保存在当前标签页（浏览器会话存储），刷新不丢、关闭标签页即由浏览器清除，不写入磁盘，也不会上传任何服务器。
                      需要留档请用「导出明细 / 导出申报底稿 / 报表导出」另存文件。
                      消费税、房产税、城镇土地使用税、个人所得税代扣代缴等请在「其他税费」手工填列。
                    </div>
                  </Accordion>
                </Reveal>
              </div>
            </div>
          </section>
            </>
          )}
        </div>
      </div>

      <footer className="footer">
        <div className="wrap footer__inner">
          <span>
            发票与税负工作台 · 数据只在本次会话，关闭标签页即清除
            {invoices.length ? ` · ${invoices.length} 张发票` : ""}
            {statements.length ? ` · ${statements.length} 份报表` : ""}
          </span>
          <span className="row" style={{ gap: 16 }}>
            {hasData && (
              <button className="btn--text" onClick={() => setShowClear(true)}>
                清空数据
              </button>
            )}
            <a className="btn--text" href="#top" style={{ fontSize: 15 }}>
              回到顶部
            </a>
          </span>
        </div>
      </footer>

      {showClear && (
        <ClearDialog
          invoiceCount={invoices.length}
          statementCount={statements.length}
          onClose={() => setShowClear(false)}
          onClearBusiness={clearBusiness}
          onClearAll={clearAll}
        />
      )}

      {showForm && (
        <InvoiceModal
          initial={editing ?? undefined}
          categories={projectOptions}
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
