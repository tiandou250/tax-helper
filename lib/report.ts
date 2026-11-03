import type { Invoice, TaxSettings } from "./types";
import { isDeductible } from "./types";
import type { LedgerRow, NamedBucket, RateBucket, TaxResult } from "./tax";
import { periodKindOf, periodLabel } from "./tax";
import { KIND_LABEL as STMT_LABEL, LINES, type StatementDoc } from "./statement";

type Cell = string | number;

const escape = (v: Cell) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

export function downloadCsv(filename: string, rows: Cell[][]) {
  const body = rows.map((r) => r.map(escape).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${body}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const DIR_LABEL = { input: "进项", output: "销项" } as const;
export const KIND_LABEL = { special: "专票", ordinary: "普票" } as const;

/* ------------------------------------------------------------------ */
/* 分类汇总导出                                                        */
/* ------------------------------------------------------------------ */

export function exportRateCsv(rates: RateBucket[], total: number, period: string) {
  downloadCsv(`按税率汇总-${period || "全部"}.csv`, [
    ["税率", "张数", "专票金额", "普票金额", "不含税金额", "税额", "金额占比"],
    ...rates.map((b) => [
      `${b.rate}%`,
      b.count,
      b.specialAmount.toFixed(2),
      b.ordinaryAmount.toFixed(2),
      b.amount.toFixed(2),
      b.tax.toFixed(2),
      total > 0 ? `${((b.amount / total) * 100).toFixed(2)}%` : "0%",
    ]),
    [
      "合计",
      rates.reduce((s, b) => s + b.count, 0),
      rates.reduce((s, b) => s + b.specialAmount, 0).toFixed(2),
      rates.reduce((s, b) => s + b.ordinaryAmount, 0).toFixed(2),
      rates.reduce((s, b) => s + b.amount, 0).toFixed(2),
      rates.reduce((s, b) => s + b.tax, 0).toFixed(2),
      "100%",
    ],
  ]);
}

export function exportKindCsv(
  rows: { label: string; amount: number; tax: number; count: number }[],
  period: string,
) {
  downloadCsv(`按票种汇总-${period || "全部"}.csv`, [
    ["票种", "张数", "不含税金额", "税额", "价税合计"],
    ...rows.map((r) => [
      r.label,
      r.count,
      r.amount.toFixed(2),
      r.tax.toFixed(2),
      (r.amount + r.tax).toFixed(2),
    ]),
    [
      "合计",
      rows.reduce((s, r) => s + r.count, 0),
      rows.reduce((s, r) => s + r.amount, 0).toFixed(2),
      rows.reduce((s, r) => s + r.tax, 0).toFixed(2),
      rows.reduce((s, r) => s + r.amount + r.tax, 0).toFixed(2),
    ],
  ]);
}

export function exportNamedCsv(
  title: string,
  rows: NamedBucket[],
  total: number,
  period: string,
) {
  downloadCsv(`${title}-${period || "全部"}.csv`, [
    [title.replace("按", ""), "张数", "不含税金额", "税额", "销项金额", "进项金额", "金额占比"],
    ...rows.map((r) => [
      r.name,
      r.count,
      r.amount.toFixed(2),
      r.tax.toFixed(2),
      r.outputAmount.toFixed(2),
      r.inputAmount.toFixed(2),
      total > 0 ? `${((r.amount / total) * 100).toFixed(2)}%` : "0%",
    ]),
  ]);
}

export function exportInvoiceCsv(invoices: Invoice[], period: string) {
  downloadCsv(`发票明细-${period || "全部"}.csv`, [
    [
      "发票类型",
      "发票种类",
      "开票日期",
      "发票号码",
      "对方单位",
      "商品名称",
      "不含税金额",
      "税率",
      "税额",
      "价税合计",
      "进项勾选",
    ],
    ...invoices.map((i) => [
      DIR_LABEL[i.direction],
      KIND_LABEL[i.kind],
      i.date,
      i.number,
      i.counterparty,
      i.category,
      i.amount.toFixed(2),
      String(i.rate),
      i.tax.toFixed(2),
      i.total.toFixed(2),
      i.direction === "input" ? (isDeductible(i) ? "已勾选" : "未勾选") : "",
    ]),
  ]);
}

/* ------------------------------------------------------------------ */
/* 申报底稿（Excel）                                                   */
/* ------------------------------------------------------------------ */

export interface WorkbookInput {
  invoices: Invoice[];
  settings: TaxSettings;
  period: string;
  result: TaxResult;
  ledger: LedgerRow[];
  rates: RateBucket[];
  categories: NamedBucket[];
  parties: NamedBucket[];
  byKind: { label: string; amount: number; tax: number; count: number }[];
  /** 当前期间的财务报表（有则追加到工作簿） */
  statements?: StatementDoc[];
}

export async function exportWorkbook(input: WorkbookInput) {
  const XLSX = await import("xlsx");
  const { invoices, settings, period, result, ledger, rates, categories, parties, byKind } = input;
  const wb = XLSX.utils.book_new();
  const tag = period || "全部";

  /* 1. 发票明细 */
  const detail: Cell[][] = [
    ["发票类型", "发票种类", "开票日期", "发票号码", "对方单位", "商品名称", "不含税金额", "税率", "税额", "价税合计", "进项勾选"],
    ...invoices.map((i) => [
      DIR_LABEL[i.direction],
      KIND_LABEL[i.kind],
      i.date,
      i.number,
      i.counterparty,
      i.category,
      i.amount,
      i.rate,
      i.tax,
      i.total,
      i.direction === "input" ? (isDeductible(i) ? "已勾选" : "未勾选") : "",
    ]),
    ["合计", "", "", "", "", "", result.outputAmount + result.inputAmount, "", result.outputTax + result.inputTaxAll, "", ""],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(detail);
  ws1["!cols"] = [10, 10, 12, 24, 32, 20, 14, 8, 12, 14, 10].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws1, "发票明细");

  /* 2. 分类汇总 */
  const summary: Cell[][] = [
    [`分类汇总 · ${periodLabel(period)}`],
    [],
    ["按税率"],
    ["税率", "张数", "专票金额", "普票金额", "不含税金额", "税额"],
    ...rates.map((b) => [`${b.rate}%`, b.count, b.specialAmount, b.ordinaryAmount, b.amount, b.tax]),
    [],
    ["按票种"],
    ["票种", "张数", "不含税金额", "税额"],
    ...byKind.map((r) => [r.label, r.count, r.amount, r.tax]),
    [],
    ["按费用类别"],
    ["类别", "张数", "不含税金额", "税额"],
    ...categories.map((r) => [r.name, r.count, r.amount, r.tax]),
    [],
    ["按往来单位"],
    ["单位", "张数", "不含税金额", "税额", "销项金额", "进项金额"],
    ...parties.map((r) => [r.name, r.count, r.amount, r.tax, r.outputAmount, r.inputAmount]),
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(summary);
  ws2["!cols"] = [28, 10, 16, 16, 16, 16].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws2, "分类汇总");

  /* 3. 税金测算 */
  const kind = periodKindOf(period);
  const taxSheet: Cell[][] = [
    ["税金测算底稿"],
    ["所属期间", periodLabel(period)],
    ["纳税人身份", settings.taxpayer === "general" ? "一般纳税人" : `小规模纳税人（${settings.smallRate}% 征收率）`],
    ["城建税税率", `${settings.cityRate}%`],
    ["小型微利企业", settings.smallBusiness ? "是（六税两费减半）" : "否"],
    ["期间费用", settings.expenses],
    ["期初留抵", settings.openingCredit],
    ["所得税率", `${settings.incomeTaxRate}%`],
    ["印花税率", `${settings.stampRate}%`],
    ["发票张数", result.invoiceCount],
    [],
    ["税种", "计税依据", "计税基数", "税率", "税额"],
    ...result.lines.map((l) => [l.name, l.basis, l.base, l.rateLabel, l.amount]),
    ["合计", "", "", "", result.total],
    [],
    ["关键指标", "金额"],
    ["销项不含税收入", result.outputAmount],
    ["进项不含税成本", result.inputAmount],
    ["销项税额", result.outputTax],
    ["可抵扣进项税额", result.inputTax],
    ["不得抵扣进项税额", result.inputTaxBlocked],
    ["应纳增值税", result.vatPayable],
    ["期末留抵", result.credit],
    ["利润总额（估算）", result.profit],
    ["综合税负率", `${result.effectiveRate.toFixed(2)}%`],
    [],
    ["说明"],
    ...result.notes.map((n) => [n]),
  ];
  if (kind === "year") taxSheet.splice(2, 0, ["口径说明", "年度汇总仅作分析，实际按申报期缴纳"]);
  const ws3 = XLSX.utils.aoa_to_sheet(taxSheet);
  ws3["!cols"] = [28, 40, 16, 14, 16].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws3, "税金测算");

  /* 4. 留抵台账 */
  if (ledger.length) {
    const ws4 = XLSX.utils.aoa_to_sheet([
      ["月份", "销项税额", "可抵扣进项税额", "期初留抵", "应纳增值税", "期末留抵"],
      ...ledger.map((r) => [r.month, r.outputTax, r.inputTax, r.opening, r.payable, r.closing]),
    ]);
    ws4["!cols"] = [12, 14, 16, 14, 14, 14].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws4, "留抵台账");
  }

  /* 5. 财务报表（利润表 / 资产负债表 / 现金流量表） */
  for (const doc of input.statements ?? []) {
    const rows: Cell[][] = [[STMT_LABEL[doc.kind], doc.period || "未标期间"], ["科目", "金额"]];
    for (const line of LINES[doc.kind]) {
      const v = doc.items[line.key];
      if (v !== undefined) rows.push([line.label, v]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [28, 18].map((w) => ({ wch: w }));
    const name = `${STMT_LABEL[doc.kind]}${doc.period ? `-${doc.period}` : ""}`.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }

  XLSX.writeFile(wb, `申报底稿-${tag}.xlsx`);
}
