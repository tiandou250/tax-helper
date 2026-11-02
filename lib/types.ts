export type Direction = "input" | "output";
export type InvoiceKind = "special" | "ordinary";
export type TaxpayerType = "general" | "small";

export interface Invoice {
  id: string;
  /** 进项 / 销项 */
  direction: Direction;
  /** 专票 / 普票 */
  kind: InvoiceKind;
  /** 开票日期 YYYY-MM-DD */
  date: string;
  number: string;
  counterparty: string;
  /** 商品或服务类别 */
  category: string;
  /** 不含税金额 */
  amount: number;
  /** 税率（百分数，13 表示 13%） */
  rate: number;
  /** 税额 */
  tax: number;
  /** 价税合计 */
  total: number;
  /** 进项是否已勾选（认证）抵扣，仅对进项专票有意义 */
  checked: boolean;
  /** 手工备注 */
  note?: string;
}

/** 进项税额是否真的可以抵扣：必须已勾选且为专用发票 */
export const isDeductible = (inv: Invoice) =>
  inv.direction === "input" && inv.kind === "special" && inv.checked;

export interface TaxSettings {
  /** 本单位全称：用于从版式发票中自动判断进项 / 销项 */
  companyName: string;
  taxpayer: TaxpayerType;
  /** 城市维护建设税税率：7 市区 / 5 县城镇 / 1 其他 */
  cityRate: number;
  /** 小规模纳税人征收率 1 / 3 */
  smallRate: number;
  /** 小型微利企业（六税两费减半 + 所得税优惠） */
  smallBusiness: boolean;
  /** 小规模月销售额 10 万以下免征增值税 */
  vatExemption: boolean;
  /** 期间费用（工资、房租、折旧等），用于企业所得税估算 */
  expenses: number;
  /** 期初留抵税额 */
  openingCredit: number;
  /** 企业所得税税率 */
  incomeTaxRate: number;
  /** 印花税税率（买卖合同万分之三 = 0.03%） */
  stampRate: number;
  /** 手工补充的其他税费（房产税、土地使用税等），计入合计 */
  otherTaxes: number;
}

export const DEFAULT_SETTINGS: TaxSettings = {
  companyName: "",
  taxpayer: "general",
  cityRate: 7,
  smallRate: 1,
  smallBusiness: true,
  vatExemption: true,
  expenses: 60000,
  openingCredit: 0,
  incomeTaxRate: 5,
  stampRate: 0.03,
  otherTaxes: 0,
};

export const RATE_OPTIONS = [13, 9, 6, 5, 3, 1, 0];

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * 由「不含税金额 / 税率 / 税额 / 价税合计」中的任意两项补全其余字段。
 * 优先级：金额 + 税率 > 价税合计 + 税率 > 税额 + 税率。
 */
export function completeInvoice(
  raw: Partial<Invoice> & { amount?: number; tax?: number; total?: number; rate?: number },
): Invoice {
  const rate = Number(raw.rate ?? 0);
  let amount = Number(raw.amount ?? NaN);
  let tax = Number(raw.tax ?? NaN);
  let total = Number(raw.total ?? NaN);
  const r = rate / 100;

  if (!isFinite(amount) && isFinite(total) && rate >= 0) amount = total / (1 + r);
  if (!isFinite(tax) && isFinite(amount) && rate >= 0) tax = amount * r;
  if (!isFinite(amount) && isFinite(tax) && rate > 0) amount = tax / r;
  if (!isFinite(total) && isFinite(amount) && isFinite(tax)) total = amount + tax;
  if (!isFinite(tax) && isFinite(total) && isFinite(amount)) tax = total - amount;
  if (!isFinite(amount)) amount = 0;
  if (!isFinite(tax)) tax = 0;
  if (!isFinite(total)) total = amount + tax;

  return {
    id: raw.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    direction: raw.direction ?? "output",
    kind: raw.kind ?? "special",
    date: raw.date ?? new Date().toISOString().slice(0, 10),
    number: raw.number ?? "",
    counterparty: raw.counterparty ?? "",
    category: raw.category ?? "未分类",
    amount: round2(amount),
    rate,
    tax: round2(tax),
    total: round2(total),
    checked: raw.checked ?? raw.kind === "special",
    note: raw.note,
  };
}
