import type { Invoice, TaxSettings } from "./types";
import { isDeductible, round2 } from "./types";
import { inPeriod, listMonths, periodKindOf } from "./period";
import { summarizeProfit } from "./statement";
import type { StatementDoc } from "./statement";

/* 期间工具集中在 lib/period.ts，这里原样透出，调用方无需改 import 路径 */
export {
  inPeriod,
  listMonths,
  monthsOfPeriod,
  periodKindOf,
  periodLabel,
  periodOptions,
  periodContains,
} from "./period";
export type { PeriodKind } from "./period";

export interface TaxLine {
  key: string;
  name: string;
  /** 计税依据说明 */
  basis: string;
  /** 计税基数（金额） */
  base: number;
  /** 税率展示 */
  rateLabel: string;
  /** 税额 */
  amount: number;
  hint?: string;
}

export interface TaxResult {
  period: string;
  outputAmount: number;
  inputAmount: number;
  outputTax: number;
  /** 全部进项税额（含不可抵扣） */
  inputTaxAll: number;
  /** 可抵扣进项税额 */
  inputTax: number;
  /** 不得抵扣进项税额 */
  inputTaxBlocked: number;
  vatPayable: number;
  /** 期末留抵税额 */
  credit: number;
  surchargeTotal: number;
  stampDuty: number;
  incomeTax: number;
  otherTaxes: number;
  profit: number;
  /** 利润口径：账簿（利润表）/ 发票推算 / 无数据 */
  profitSource: "book" | "invoice" | "none";
  /** 账簿税金及附加（利润表有该项时） */
  bookTaxSurcharge?: number;
  total: number;
  effectiveRate: number;
  lines: TaxLine[];
  notes: string[];
  invoiceCount: number;
}

export interface StatementBundle {
  profit?: StatementDoc;
  balance?: StatementDoc;
  cashflow?: StatementDoc;
}

export const emptyResult = (period = ""): TaxResult => ({
  period,
  outputAmount: 0,
  inputAmount: 0,
  outputTax: 0,
  inputTaxAll: 0,
  inputTax: 0,
  inputTaxBlocked: 0,
  vatPayable: 0,
  credit: 0,
  surchargeTotal: 0,
  stampDuty: 0,
  incomeTax: 0,
  otherTaxes: 0,
  profit: 0,
  profitSource: "none",
  total: 0,
  effectiveRate: 0,
  lines: [],
  notes: [],
  invoiceCount: 0,
});

/**
 * 按期间计算应缴税费。
 * 一般纳税人走「销项 - 进项抵扣」，小规模走「销售额 × 征收率」。
 *
 * 传入 statements（财务报表）后进入「综合口径」：
 * - 企业所得税改用利润表的利润总额，而不是发票推算的毛利；
 * - 税金及附加与账簿数对照，差异写进 notes；
 * - 小规模且没有发票时，用报表营业收入当销售额。
 */
export function computeTax(
  invoices: Invoice[],
  settings: TaxSettings,
  period: string,
  statements?: StatementBundle,
): TaxResult {
  const book = statements?.profit ? summarizeProfit(statements.profit) : null;
  const scoped = invoices.filter((i) => inPeriod(i.date, period));
  if (scoped.length === 0 && !book?.usable) return emptyResult(period);

  const notes: string[] = [];
  const outputs = scoped.filter((i) => i.direction === "output");
  const inputs = scoped.filter((i) => i.direction === "input");

  const outputAmount = round2(outputs.reduce((s, i) => s + i.amount, 0));
  const inputAmount = round2(inputs.reduce((s, i) => s + i.amount, 0));
  const outputTax = round2(outputs.reduce((s, i) => s + i.tax, 0));
  const inputTaxAll = round2(inputs.reduce((s, i) => s + i.tax, 0));

  if (scoped.length === 0 && book?.usable) {
    notes.push("本期没有发票，增值税按 0 处理；企业所得税已按利润表口径计算。");
  }

  const lines: TaxLine[] = [];
  let vatBase = 0;
  let vatPayable = 0;
  let credit = 0;
  let inputTax = 0;
  let inputTaxBlocked = 0;
  let vatRateLabel = "";

  if (settings.taxpayer === "general") {
    inputTax = round2(inputs.filter(isDeductible).reduce((s, i) => s + i.tax, 0));
    inputTaxBlocked = round2(inputTaxAll - inputTax);
    const available = round2(inputTax + settings.openingCredit);
    vatPayable = round2(Math.max(0, outputTax - available));
    credit = round2(Math.max(0, available - outputTax));
    vatBase = round2(Math.max(0, outputTax - inputTax));

    vatRateLabel = "销项 - 进项";
    lines.push({
      key: "vat",
      name: "增值税",
      basis: "销项税额 − 可抵扣进项税额",
      base: vatBase,
      rateLabel: vatRateLabel,
      amount: vatPayable,
      hint: credit > 0 ? `进项大于销项，${credit.toLocaleString("zh-CN")} 元结转下期留抵` : undefined,
    });

    if (settings.openingCredit > 0) {
      notes.push(`已使用期初留抵税额 ¥${settings.openingCredit.toLocaleString("zh-CN")} 参与抵扣。`);
    }
    if (inputTaxBlocked > 0) {
      notes.push(
        `有 ¥${inputTaxBlocked.toLocaleString("zh-CN")} 进项税额来自普通发票或未勾选发票，未参与抵扣。`,
      );
    }
  } else {
    const rate = settings.smallRate / 100;
    const inclusive = round2(outputs.reduce((s, i) => s + i.total, 0));
    const fromInvoice = round2(inclusive / (1 + rate));
    // 没有发票但有利润表时，用报表营业收入（通常已是含税口径的近似）
    const sales = fromInvoice > 0 ? fromInvoice : round2(book?.revenue ?? 0);
    inputTax = 0;
    inputTaxBlocked = inputTaxAll;
    vatBase = sales;

    if (fromInvoice === 0 && sales > 0) {
      notes.push("销售额取自利润表「营业收入」，按征收率换算，建议与开票数据核对。");
    }

    const kind = periodKindOf(period);
    const threshold = kind === "quarter" ? 300000 : kind === "year" ? 1200000 : 100000;
    const exempt = settings.vatExemption && sales <= threshold;
    vatPayable = exempt ? 0 : round2(sales * rate);
    vatRateLabel = `${settings.smallRate}% 征收率`;

    lines.push({
      key: "vat",
      name: "增值税",
      basis: "不含税销售额 × 征收率",
      base: sales,
      rateLabel: vatRateLabel,
      amount: vatPayable,
      hint: exempt ? "销售额未超过免征标准，本期免税" : undefined,
    });

    if (exempt) {
      notes.push(
        `本期销售额 ¥${sales.toLocaleString("zh-CN")} 未超过 ${threshold.toLocaleString("zh-CN")} 元，享受小规模纳税人免征增值税。`,
      );
    }
    notes.push("小规模纳税人不得抵扣进项税额，进项发票仅作为成本凭证。");
    if (inputTaxAll > 0) {
      notes.push(`本期进项税额 ¥${inputTaxAll.toLocaleString("zh-CN")} 全额计入成本，不参与抵扣。`);
    }
  }

  const half = settings.smallBusiness || settings.taxpayer === "small" ? 0.5 : 1;

  const urban = round2(vatPayable * (settings.cityRate / 100) * half);
  const edu = round2(vatPayable * 0.03 * half);
  const localEdu = round2(vatPayable * 0.02 * half);
  const stampDuty = round2((outputAmount + inputAmount) * (settings.stampRate / 100) * half);

  lines.push(
    {
      key: "urban",
      name: "城市维护建设税",
      basis: "实际缴纳的增值税",
      base: vatPayable,
      rateLabel: `${settings.cityRate}%`,
      amount: urban,
    },
    {
      key: "edu",
      name: "教育费附加",
      basis: "实际缴纳的增值税",
      base: vatPayable,
      rateLabel: "3%",
      amount: edu,
    },
    {
      key: "localEdu",
      name: "地方教育附加",
      basis: "实际缴纳的增值税",
      base: vatPayable,
      rateLabel: "2%",
      amount: localEdu,
    },
    {
      key: "stamp",
      name: "印花税",
      basis: "购销合同金额（不含税）· 万分之三",
      base: round2(outputAmount + inputAmount),
      rateLabel: `${settings.stampRate}%`,
      amount: stampDuty,
    },
  );

  const surchargeTotal = round2(urban + edu + localEdu);

  /* 利润口径：有利润表就用账簿利润总额，否则按发票与参数推算 */
  const useBook = Boolean(book?.usable);
  const profit = useBook
    ? round2(book!.totalProfit)
    : round2(outputAmount - inputAmount - settings.expenses - surchargeTotal - stampDuty);
  const profitSource: TaxResult["profitSource"] = useBook ? "book" : scoped.length ? "invoice" : "none";
  const incomeTax = profit > 0 ? round2(profit * (settings.incomeTaxRate / 100)) : 0;

  lines.push({
    key: "incomeTax",
    name: "企业所得税（估算）",
    basis: useBook
      ? book!.totalProfitFromBook
        ? "利润表「利润总额」× 税率"
        : "利润表科目推算的利润总额 × 税率"
      : "收入 − 成本 − 费用 − 税金",
    base: Math.max(0, profit),
    rateLabel: `${settings.incomeTaxRate}%`,
    amount: incomeTax,
    hint: profit <= 0 ? "本期利润为负，不产生应纳税所得额" : undefined,
  });

  if (useBook) {
    const b = book!;
    notes.push(
      `企业所得税已改用利润表口径：营业收入 ¥${b.revenue.toLocaleString("zh-CN")}、营业成本 ¥${b.cost.toLocaleString("zh-CN")}、期间费用 ¥${b.expenses.toLocaleString("zh-CN")}、利润总额 ¥${b.totalProfit.toLocaleString("zh-CN")}。`,
    );
    if (b.incomeTaxExpense !== undefined) {
      const gap = round2(incomeTax - b.incomeTaxExpense);
      if (Math.abs(gap) > 1) {
        notes.push(
          `报表已列所得税费用 ¥${b.incomeTaxExpense.toLocaleString("zh-CN")}，按 ${settings.incomeTaxRate}% 估算是 ¥${incomeTax.toLocaleString("zh-CN")}，差 ¥${gap.toLocaleString("zh-CN")}，可能因纳税调整或税率不同。`,
        );
      }
    }
    if (b.taxSurcharge > 0) {
      const gap = round2(b.taxSurcharge - (surchargeTotal + stampDuty));
      if (Math.abs(gap) > 1) {
        notes.push(
          `账簿「税金及附加」¥${b.taxSurcharge.toLocaleString("zh-CN")} 与测算附加税+印花税 ¥${round2(surchargeTotal + stampDuty).toLocaleString("zh-CN")} 相差 ¥${gap.toLocaleString("zh-CN")}，请核对是否有其他税种或已缴差异。`,
        );
      }
    }
    if (b.revenue > 0 && outputAmount > 0) {
      const rate = Math.abs(b.revenue - outputAmount) / b.revenue;
      if (rate > 0.01) {
        notes.push(
          `利润表营业收入 ¥${b.revenue.toLocaleString("zh-CN")} 与发票不含税销售额 ¥${outputAmount.toLocaleString("zh-CN")} 相差 ${(rate * 100).toFixed(1)}%（未开票收入或非发票口径收入）。`,
        );
      }
    }
  }

  if (settings.otherTaxes > 0) {
    lines.push({
      key: "other",
      name: "其他税费（手工）",
      basis: "房产税、土地使用税等手工填写",
      base: settings.otherTaxes,
      rateLabel: "手工",
      amount: settings.otherTaxes,
    });
  }

  if (settings.smallBusiness && settings.taxpayer === "general") {
    notes.push("已按小型微利企业适用「六税两费」减半征收，企业所得税按 5% 实际税负估算。");
  }
  if (settings.smallBusiness && profit * 12 > 3_000_000 && periodKindOf(period) !== "year") {
    notes.push("按当前利润水平年化后可能超过小型微利企业 300 万元标准，需按 25% 法定税率复核。");
  }
  if (!useBook) {
    notes.push("期间费用为手动填写的估算值；导入利润表后，企业所得税会改用账簿利润总额计算。");
  }

  const total = round2(
    vatPayable + surchargeTotal + stampDuty + incomeTax + settings.otherTaxes,
  );

  return {
    period,
    outputAmount,
    inputAmount,
    outputTax,
    inputTaxAll,
    inputTax,
    inputTaxBlocked,
    vatPayable,
    credit,
    surchargeTotal,
    stampDuty,
    incomeTax,
    otherTaxes: settings.otherTaxes,
    profit,
    profitSource,
    bookTaxSurcharge: book?.taxSurcharge,
    total,
    effectiveRate: outputAmount > 0 ? round2((total / outputAmount) * 100) : 0,
    lines,
    notes,
    invoiceCount: scoped.length,
  };
}

/* ------------------------------------------------------------------ */
/* 留抵台账                                                            */
/* ------------------------------------------------------------------ */

export interface LedgerRow {
  month: string;
  outputTax: number;
  inputTax: number;
  opening: number;
  payable: number;
  closing: number;
}

/** 按月推演留抵税额，首月承接 settings.openingCredit */
export function creditLedger(invoices: Invoice[], settings: TaxSettings): LedgerRow[] {
  const months = [...listMonths(invoices)].sort((a, b) => a.localeCompare(b));
  let opening = settings.openingCredit;
  const rows: LedgerRow[] = [];
  for (const month of months) {
    const scoped = invoices.filter((i) => i.date.startsWith(month));
    const outputTax = round2(
      scoped.filter((i) => i.direction === "output").reduce((s, i) => s + i.tax, 0),
    );
    const inputTax = round2(scoped.filter(isDeductible).reduce((s, i) => s + i.tax, 0));
    const available = round2(opening + inputTax);
    const payable = round2(Math.max(0, outputTax - available));
    const closing = round2(Math.max(0, available - outputTax));
    rows.push({ month, outputTax, inputTax, opening, payable, closing });
    opening = closing;
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* 汇总                                                                */
/* ------------------------------------------------------------------ */

export interface RateBucket {
  rate: number;
  specialAmount: number;
  ordinaryAmount: number;
  amount: number;
  tax: number;
  count: number;
  outputTax: number;
  inputTax: number;
}

export function groupByRate(invoices: Invoice[]): RateBucket[] {
  const map = new Map<number, RateBucket>();
  for (const inv of invoices) {
    const b =
      map.get(inv.rate) ??
      {
        rate: inv.rate,
        specialAmount: 0,
        ordinaryAmount: 0,
        amount: 0,
        tax: 0,
        count: 0,
        outputTax: 0,
        inputTax: 0,
      };
    b.amount += inv.amount;
    b.tax += inv.tax;
    b.count += 1;
    if (inv.kind === "special") b.specialAmount += inv.amount;
    else b.ordinaryAmount += inv.amount;
    if (inv.direction === "output") b.outputTax += inv.tax;
    else b.inputTax += inv.tax;
    map.set(inv.rate, b);
  }
  return [...map.values()]
    .map((b) => ({
      ...b,
      amount: round2(b.amount),
      tax: round2(b.tax),
      specialAmount: round2(b.specialAmount),
      ordinaryAmount: round2(b.ordinaryAmount),
      outputTax: round2(b.outputTax),
      inputTax: round2(b.inputTax),
    }))
    .sort((a, b) => b.amount - a.amount);
}

export interface NamedBucket {
  name: string;
  amount: number;
  tax: number;
  count: number;
  outputAmount: number;
  inputAmount: number;
}

export function groupBy(
  invoices: Invoice[],
  pick: (i: Invoice) => string,
  limit = 8,
): NamedBucket[] {
  const map = new Map<string, NamedBucket>();
  for (const inv of invoices) {
    const key = pick(inv) || "未分类";
    const b = map.get(key) ?? { name: key, amount: 0, tax: 0, count: 0, outputAmount: 0, inputAmount: 0 };
    b.amount += inv.amount;
    b.tax += inv.tax;
    b.count += 1;
    if (inv.direction === "output") b.outputAmount += inv.amount;
    else b.inputAmount += inv.amount;
    map.set(key, b);
  }
  return [...map.values()]
    .map((b) => ({ ...b, amount: round2(b.amount), tax: round2(b.tax) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

export interface MonthBucket {
  month: string;
  outputAmount: number;
  inputAmount: number;
  outputTax: number;
  inputTax: number;
}

export function groupByMonth(invoices: Invoice[]): MonthBucket[] {
  const map = new Map<string, MonthBucket>();
  for (const inv of invoices) {
    const m = inv.date.slice(0, 7);
    if (!m) continue;
    const b = map.get(m) ?? { month: m, outputAmount: 0, inputAmount: 0, outputTax: 0, inputTax: 0 };
    if (inv.direction === "output") {
      b.outputAmount += inv.amount;
      b.outputTax += inv.tax;
    } else {
      b.inputAmount += inv.amount;
      b.inputTax += inv.tax;
    }
    map.set(m, b);
  }
  return [...map.values()]
    .map((b) => ({
      ...b,
      outputAmount: round2(b.outputAmount),
      inputAmount: round2(b.inputAmount),
      outputTax: round2(b.outputTax),
      inputTax: round2(b.inputTax),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

