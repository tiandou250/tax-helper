/* ==========================================================================
   可视化看板的数据派生
   --------------------------------------------------------------------------
   两侧刻意取不同维度，避免两张看板长得一样：
   - 发票侧看「业务流量的时序 + 税负落点」：月度进销项、税负率、税额构成、客户集中度
   - 报表侧看「财务结构与盈利质量」：利润形成路径、成本费用构成、资产负债结构、比率
   ========================================================================== */

import type { Invoice, TaxSettings } from "./types";
import { isDeductible, round2 } from "./types";
import { inPeriod, monthsOfPeriod } from "./period";
import type { StatementDoc } from "./statement";
import { summarizeProfit } from "./statement";

export interface ShareItem {
  name: string;
  value: number;
}

export interface RatioItem {
  label: string;
  value: number;
  /** 展示单位：% 或 倍 */
  unit: "%" | "倍";
  hint: string;
  /** 参考区间判定，用于着色（不影响条形长度） */
  level: "good" | "warn" | "plain";
}

/* ==========================================================================
   一、发票侧
   ========================================================================== */

export interface MonthFlow {
  month: string;
  outputAmount: number;
  inputAmount: number;
  outputTax: number;
  inputTax: number;
  /** 已推演留抵后的实际应纳增值税 */
  vatPayable: number;
  closingCredit: number;
  surcharge: number;
  stamp: number;
  incomeTax: number;
  taxTotal: number;
  /** 综合税负率 = 税费合计 ÷ 销项不含税收入 */
  burdenRate: number;
  /** 进销差额（不含税），近似毛利贡献 */
  netFlow: number;
  count: number;
  /** 是否属于当前所选期间 */
  active: boolean;
}

export interface InvoiceInsights {
  months: MonthFlow[];
  scope: {
    label: string;
    months: string[];
    invoiceCount: number;
    outputAmount: number;
    inputAmount: number;
    outputTax: number;
    inputTax: number;
    /** 可抵扣进项税额占全部进项税额的比例 */
    deductibleShare: number;
    avgInvoice: number;
    avgBurden: number;
    peak: { month: string; tax: number; active: boolean } | null;
  };
  outputTaxByRate: ShareItem[];
  inputTaxByRate: ShareItem[];
  kindStructure: { label: string; special: number; ordinary: number; count: number }[];
  topCustomers: ShareItem[];
  topSuppliers: ShareItem[];
  sizeBuckets: { label: string; count: number; amount: number }[];
}

const SIZE_BUCKETS: { label: string; max: number }[] = [
  { label: "<1 万", max: 10_000 },
  { label: "1–5 万", max: 50_000 },
  { label: "5–10 万", max: 100_000 },
  { label: "10–50 万", max: 500_000 },
  { label: "50–100 万", max: 1_000_000 },
  { label: "≥100 万", max: Infinity },
];

const sum = <T,>(list: T[], pick: (v: T) => number) => list.reduce((s, v) => s + pick(v), 0);

const pctOf = (a: number, b: number) => (b > 0 ? round2((a / b) * 100) : 0);

/** 按占比取前 N 项，其余合并为「其他」 */
export function topShare(items: ShareItem[], n = 5): ShareItem[] {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  if (sorted.length <= n) return sorted;
  const head = sorted.slice(0, n);
  const rest = sorted.slice(n).reduce((s, i) => s + i.value, 0);
  return rest > 0 ? [...head, { name: `其他 ${sorted.length - n} 家`, value: round2(rest) }] : head;
}

export function invoiceInsights(
  invoices: Invoice[],
  settings: TaxSettings,
  period: string,
): InvoiceInsights {
  const monthSet = new Set<string>();
  for (const i of invoices) {
    const m = i.date.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(m)) monthSet.add(m);
  }
  const allMonths = [...monthSet].sort();
  const inScope = new Set(monthsOfPeriod(period));

  const half = settings.smallBusiness || settings.taxpayer === "small" ? 0.5 : 1;
  const surchargeRate = ((settings.cityRate + 3 + 2) / 100) * half;
  const monthlyExpense = settings.expenses / 12;

  let opening = settings.openingCredit;
  const months: MonthFlow[] = allMonths.map((month) => {
    const list = invoices.filter((i) => i.date.startsWith(month));
    const outputs = list.filter((i) => i.direction === "output");
    const inputs = list.filter((i) => i.direction === "input");

    const outputAmount = round2(sum(outputs, (i) => i.amount));
    const inputAmount = round2(sum(inputs, (i) => i.amount));
    const outputTax = round2(sum(outputs, (i) => i.tax));
    const inputTax = round2(sum(inputs.filter(isDeductible), (i) => i.tax));

    const available = round2(opening + inputTax);
    const vatPayable = round2(Math.max(0, outputTax - available));
    const closingCredit = round2(Math.max(0, available - outputTax));

    const surcharge = round2(vatPayable * surchargeRate);
    const stamp = round2((outputAmount + inputAmount) * (settings.stampRate / 100) * half);
    const profit = outputAmount - inputAmount - monthlyExpense - surcharge - stamp;
    const incomeTax = profit > 0 ? round2(profit * (settings.incomeTaxRate / 100)) : 0;
    const taxTotal = round2(vatPayable + surcharge + stamp + incomeTax);

    opening = closingCredit;

    return {
      month,
      outputAmount,
      inputAmount,
      outputTax,
      inputTax,
      vatPayable,
      closingCredit,
      surcharge,
      stamp,
      incomeTax,
      taxTotal,
      burdenRate: outputAmount > 0 ? round2((taxTotal / outputAmount) * 100) : 0,
      netFlow: round2(outputAmount - inputAmount),
      count: list.length,
      active: inScope.has(month),
    };
  });

  /* ---- 构成类图表按「当前期间」取样 ---- */
  const scoped = invoices.filter((i) => inPeriod(i.date, period));
  const rateMap = (rows: Invoice[]) => {
    const map = new Map<number, number>();
    for (const r of rows) map.set(r.rate, (map.get(r.rate) ?? 0) + r.tax);
    return [...map.entries()]
      .map(([rate, value]) => ({ name: `${rate}%`, value: round2(value) }))
      .filter((v) => v.value > 0)
      .sort((a, b) => b.value - a.value);
  };

  const scopedOutput = scoped.filter((i) => i.direction === "output");
  const scopedInput = scoped.filter((i) => i.direction === "input");

  const kindStructure = [
    { label: "销项", direction: "output" as const },
    { label: "进项", direction: "input" as const },
  ].map(({ label, direction }) => {
    const rows = scoped.filter((i) => i.direction === direction);
    return {
      label,
      special: round2(sum(rows.filter((i) => i.kind === "special"), (i) => i.amount)),
      ordinary: round2(sum(rows.filter((i) => i.kind === "ordinary"), (i) => i.amount)),
      count: rows.length,
    };
  });

  const partyMap = (rows: Invoice[]) => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const key = r.counterparty?.trim() || "未填写";
      map.set(key, (map.get(key) ?? 0) + r.amount);
    }
    return [...map.entries()].map(([name, value]) => ({ name, value: round2(value) }));
  };

  const sizeBuckets = SIZE_BUCKETS.map(({ label, max }, idx) => {
    const min = idx === 0 ? -Infinity : SIZE_BUCKETS[idx - 1].max;
    const rows = scoped.filter((i) => i.amount > min && i.amount <= max);
    return { label, count: rows.length, amount: round2(sum(rows, (i) => i.amount)) };
  });

  const scopeOutputAmount = round2(sum(scopedOutput, (i) => i.amount));
  const scopeInputAmount = round2(sum(scopedInput, (i) => i.amount));
  const scopeOutputTax = round2(sum(scopedOutput, (i) => i.tax));
  const scopeInputTaxAll = round2(sum(scopedInput, (i) => i.tax));
  const scopeInputTaxOk = round2(sum(scopedInput.filter(isDeductible), (i) => i.tax));

  const scopedMonths = months.filter((m) => m.active);
  /* 峰值取全期，否则期间只剩一个月时这个指标就没有意义 */
  const peak = months.length ? months.reduce((a, b) => (b.taxTotal > a.taxTotal ? b : a)) : null;
  const flatBurden = scopedMonths.length
    ? round2(sum(scopedMonths, (m) => m.burdenRate) / scopedMonths.length)
    : 0;
  const peakActive = peak ? peak.active : false;

  return {
    months,
    scope: {
      label: period || "全部期间",
      months: scopedMonths.map((m) => m.month),
      invoiceCount: scoped.length,
      outputAmount: scopeOutputAmount,
      inputAmount: scopeInputAmount,
      outputTax: scopeOutputTax,
      inputTax: scopeInputTaxAll,
      deductibleShare: scopeInputTaxAll > 0 ? round2((scopeInputTaxOk / scopeInputTaxAll) * 100) : 0,
      avgInvoice: scoped.length ? round2(sum(scoped, (i) => i.amount) / scoped.length) : 0,
      avgBurden: flatBurden,
      peak: peak ? { month: peak.month, tax: peak.taxTotal, active: peakActive } : null,
    },
    outputTaxByRate: rateMap(scopedOutput),
    inputTaxByRate: rateMap(scopedInput),
    kindStructure,
    topCustomers: topShare(partyMap(scopedOutput)),
    topSuppliers: topShare(partyMap(scopedInput)),
    sizeBuckets,
  };
}

/* ==========================================================================
   二、报表侧
   ========================================================================== */

export interface WaterfallStep {
  label: string;
  /** 增量（可正可负）；isTotal 时为该步的累计终值 */
  delta: number;
  isTotal?: boolean;
}

export interface YoYRow {
  label: string;
  current: number;
  prior: number;
}

export interface StatementInsights {
  hasAny: boolean;
  profit?: {
    doc: StatementDoc;
    waterfall: WaterfallStep[];
    costComposition: ShareItem[];
    ratios: RatioItem[];
  };
  balance?: {
    doc: StatementDoc;
    assetComposition: ShareItem[];
    fundingComposition: ShareItem[];
    ratios: RatioItem[];
  };
  cashflow?: {
    doc: StatementDoc;
    bars: { label: string; value: number }[];
    inflow: ShareItem[];
    outflow: ShareItem[];
  };
  /** 本期 vs 上期（取自报表的其它口径列，如「本年累计 / 上年累计」） */
  yoy?: { title: string; unit: string; rows: YoYRow[] };
}

export interface TrendBlock {
  title: string;
  /** 期间标签，升序 */
  labels: string[];
  series: { name: string; values: number[] }[];
}

/** 期间标签：2025 / 2025-10 / 2025-Q4 统一成短写法 */
const shortPeriod = (p: string) => {
  if (/^\d{4}-\d{2}$/.test(p)) return p.replace("-", "/").slice(2);
  if (/^\d{4}-Q\d$/.test(p)) return `${p.slice(2, 4)}Q${p.slice(-1)}`;
  return p;
};

/**
 * 跨期趋势：同一张表导入多个期间时才成立。
 * 这是发票侧没有的视角——发票是按月的流水，报表是按期的一张快照。
 */
export function statementTrend(docs: StatementDoc[]): TrendBlock | null {
  const byKind = (kind: StatementDoc["kind"]) =>
    docs
      .filter((d) => d.kind === kind && /^\d{4}/.test(d.period))
      .sort((a, b) => a.period.localeCompare(b.period));

  const build = (
    list: StatementDoc[],
    title: string,
    keys: [string, string][],
  ): TrendBlock | null => {
    if (list.length < 2) return null;
    const series = keys
      .map(([key, name]) => ({
        name,
        values: list.map((d) => Number(d.items[key] ?? 0)),
      }))
      .filter((s) => s.values.some((v) => v !== 0));
    if (series.length === 0) return null;
    return { title, labels: list.map((d) => shortPeriod(d.period)), series };
  };

  const profit = byKind("profit");
  const fromProfit = build(profit, "利润跨期趋势", [
    ["revenue", "营业收入"],
    ["cost", "营业成本"],
    ["totalProfit", "利润总额"],
  ]);
  if (fromProfit) return fromProfit;

  const balance = byKind("balance");
  return build(balance, "资产与权益跨期趋势", [
    ["totalAssets", "资产总计"],
    ["totalLiab", "负债合计"],
    ["totalEquity", "所有者权益合计"],
  ]);
}

/** 从 variants 里找「本期 / 上期」两套口径 */function variantPair(doc: StatementDoc | undefined): { cur: Record<string, number>; prior: Record<string, number>; curLabel: string; priorLabel: string } | null {
  const vs = doc?.variants ?? [];
  if (vs.length < 2) return null;
  const pick = (re: RegExp) => vs.find((v) => re.test(v.label));
  const cur = pick(/本年累计/) ?? pick(/期末/);
  const prior = pick(/上年累计|上年同期/) ?? pick(/年初/);
  if (cur && prior) {
    return { cur: cur.items, prior: prior.items, curLabel: cur.label, priorLabel: prior.label };
  }
  return null;
}

export function statementInsights(docs: {
  profit?: StatementDoc;
  balance?: StatementDoc;
  cashflow?: StatementDoc;
}): StatementInsights {
  const out: StatementInsights = { hasAny: Boolean(docs.profit || docs.balance || docs.cashflow) };

  /* ---------------- 利润表 ---------------- */
  if (docs.profit) {
    const p = summarizeProfit(docs.profit);
    const n = (k: string) => Number(docs.profit!.items[k] ?? 0);

    const otherSum = round2(
      p.otherIncome + p.investmentIncome + p.nonOpIncome - p.nonOpExpense,
    );

    const waterfall: WaterfallStep[] = [
      { label: "营业收入", delta: p.revenue, isTotal: true },
      { label: "营业成本", delta: -p.cost },
      { label: "税金及附加", delta: -p.taxSurcharge },
      { label: "期间费用", delta: -p.expenses },
    ];
    if (otherSum !== 0) waterfall.push({ label: "其他与营业外", delta: otherSum });
    waterfall.push({ label: "利润总额", delta: p.totalProfit, isTotal: true });
    if (p.incomeTaxExpense !== undefined) {
      waterfall.push({ label: "所得税费用", delta: -p.incomeTaxExpense });
      waterfall.push({
        label: "净利润",
        delta: round2(p.totalProfit - p.incomeTaxExpense),
        isTotal: true,
      });
    } else if (p.netProfit !== undefined && Math.abs(p.netProfit - p.totalProfit) > 0.01) {
      waterfall.push({ label: "净利润", delta: p.netProfit, isTotal: true });
    }

    const costComposition: ShareItem[] = [
      { name: "营业成本", value: p.cost },
      { name: "税金及附加", value: p.taxSurcharge },
      { name: "销售费用", value: p.selling },
      { name: "管理费用", value: p.admin },
      { name: "研发费用", value: p.rd },
      { name: "财务费用", value: p.finance },
    ].filter((v) => v.value > 0);

    const opProfit =
      n("operatingProfit") !== 0 || docs.profit.items.operatingProfit !== undefined
        ? n("operatingProfit")
        : round2(p.revenue - p.cost - p.taxSurcharge - p.expenses);

    const pct = (a: number, b: number) => (b > 0 ? round2((a / b) * 100) : 0);
    const ratios: RatioItem[] = [
      {
        label: "毛利率",
        value: pct(p.revenue - p.cost, p.revenue),
        unit: "%",
        hint: "(营业收入 − 营业成本) ÷ 营业收入",
        level: "plain",
      },
      {
        label: "营业利润率",
        value: pct(opProfit, p.revenue),
        unit: "%",
        hint: "营业利润 ÷ 营业收入",
        level: opProfit > 0 ? "good" : "warn",
      },
      {
        label: "净利率",
        value: pct(p.netProfit ?? p.totalProfit, p.revenue),
        unit: "%",
        hint: "净利润 ÷ 营业收入",
        level: (p.netProfit ?? p.totalProfit) > 0 ? "good" : "warn",
      },
      {
        label: "期间费用率",
        value: pct(p.expenses, p.revenue),
        unit: "%",
        hint: "期间费用 ÷ 营业收入",
        level: "plain",
      },
      {
        label: "成本费用利润率",
        value: pct(p.totalProfit, p.cost + p.taxSurcharge + p.expenses),
        unit: "%",
        hint: "利润总额 ÷ 成本费用合计",
        level: p.totalProfit > 0 ? "good" : "warn",
      },
    ];

    out.profit = { doc: docs.profit, waterfall, costComposition, ratios };
  }

  /* ---------------- 资产负债表 ---------------- */
  if (docs.balance) {
    const b = docs.balance.items;
    const g = (k: string) => Number(b[k] ?? 0);
    const totalAssets = g("totalAssets");
    const totalLiab = g("totalLiab");
    const totalEquity = g("totalEquity");
    const currentAssets = g("currentAssets") || round2(g("cash") + g("receivable") + g("prepaid") + g("inventory"));
    const currentLiab = g("currentLiab") || totalLiab;

    const otherCurrent = Math.max(
      0,
      round2(currentAssets - g("cash") - g("receivable") - g("prepaid") - g("inventory")),
    );
    const fixed = g("fixedAssets");
    const otherAssets = Math.max(0, round2(totalAssets - currentAssets - fixed));

    const assetComposition: ShareItem[] = [
      { name: "货币资金", value: g("cash") },
      { name: "应收账款", value: g("receivable") },
      { name: "存货", value: g("inventory") },
      { name: "预付款项", value: g("prepaid") },
      { name: "其他流动资产", value: otherCurrent },
      { name: "固定资产", value: fixed },
      { name: "其他资产", value: otherAssets },
    ].filter((v) => v.value > 0);

    const fundingComposition: ShareItem[] = [
      { name: "流动负债", value: currentLiab },
      { name: "非流动负债", value: Math.max(0, round2(totalLiab - currentLiab)) },
      { name: "所有者权益", value: totalEquity },
    ].filter((v) => v.value > 0);

    const ratio = (a: number, c: number) => (c > 0 ? round2(a / c) : 0);
    const ratios: RatioItem[] = [
      {
        label: "资产负债率",
        value: pctOf(totalLiab, totalAssets),
        unit: "%",
        hint: "负债合计 ÷ 资产总计，40%–60% 通常较稳健",
        level: totalAssets === 0 ? "plain" : totalLiab / (totalAssets || 1) > 0.7 ? "warn" : "good",
      },
      {
        label: "净资产占比",
        value: pctOf(totalEquity, totalAssets),
        unit: "%",
        hint: "所有者权益 ÷ 资产总计",
        level: "plain",
      },
      {
        label: "流动比率",
        value: ratio(currentAssets, currentLiab),
        unit: "倍",
        hint: "流动资产 ÷ 流动负债，2 倍左右较安全",
        level: currentLiab === 0 ? "plain" : ratio(currentAssets, currentLiab) >= 1 ? "good" : "warn",
      },
      {
        label: "速动比率",
        value: ratio(currentAssets - g("inventory"), currentLiab),
        unit: "倍",
        hint: "(流动资产 − 存货) ÷ 流动负债",
        level: currentLiab === 0 ? "plain" : ratio(currentAssets - g("inventory"), currentLiab) >= 1 ? "good" : "warn",
      },
      {
        label: "存货占流动资产",
        value: pctOf(g("inventory"), currentAssets),
        unit: "%",
        hint: "存货 ÷ 流动资产合计",
        level: "plain",
      },
    ];

    out.balance = { doc: docs.balance, assetComposition, fundingComposition, ratios };
  }

  /* ---------------- 现金流量表 ---------------- */
  if (docs.cashflow) {
    const c = docs.cashflow.items;
    const g = (k: string) => Number(c[k] ?? 0);

    const bars = [
      { label: "经营活动", value: g("operatingNet") },
      { label: "投资活动", value: g("investingNet") },
      { label: "筹资活动", value: g("financingNet") },
      { label: "净增加额", value: g("netIncrease") },
    ].filter((v) => v.value !== 0);

    const otherIn = Math.max(0, round2(g("cashIn") - g("salesCash") - g("taxRefund")));
    const otherOut = Math.max(
      0,
      round2(g("cashOut") - g("purchaseCash") - g("staffCash") - g("taxPaid")),
    );

    const inflow = [
      { name: "销售收现", value: g("salesCash") },
      { name: "税费返还", value: g("taxRefund") },
      { name: "其他流入", value: otherIn },
    ].filter((v) => v.value > 0);

    const outflow = [
      { name: "购买商品", value: g("purchaseCash") },
      { name: "职工薪酬", value: g("staffCash") },
      { name: "支付税费", value: g("taxPaid") },
      { name: "其他流出", value: otherOut },
    ].filter((v) => v.value > 0);

    out.cashflow = { doc: docs.cashflow, bars, inflow, outflow };
  }

  /* ---------------- 本期 vs 上期 ---------------- */
  const pair = variantPair(docs.profit) ?? variantPair(docs.balance);
  if (pair) {
    const isProfit = Boolean(docs.profit && variantPair(docs.profit));
    const keys = isProfit
      ? ([
          ["revenue", "营业收入"],
          ["cost", "营业成本"],
          ["totalProfit", "利润总额"],
          ["netProfit", "净利润"],
        ] as const)
      : ([
          ["totalAssets", "资产总计"],
          ["totalLiab", "负债合计"],
          ["totalEquity", "所有者权益"],
          ["cash", "货币资金"],
        ] as const);

    const rows: YoYRow[] = keys
      .map(([key, label]) => ({
        label,
        current: Number(pair.cur[key] ?? 0),
        prior: Number(pair.prior[key] ?? 0),
      }))
      .filter((r) => r.current !== 0 || r.prior !== 0);

    if (rows.length >= 2) {
      out.yoy = {
        title: `${pair.curLabel} vs ${pair.priorLabel}`,
        unit: isProfit ? "利润表" : "资产负债表",
        rows,
      };
    }
  }

  return out;
}
