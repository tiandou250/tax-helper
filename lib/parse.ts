import type { Direction, Invoice, InvoiceKind } from "./types";
import { completeInvoice } from "./types";
import { buildInvoice, parseDoc, type Confidence } from "./doc-parse";

export interface ParseResult {
  invoices: Invoice[];
  errors: string[];
  warnings: string[];
  /** 扫描行数（表格）/ 文件数（单票） */
  total: number;
  /** 识别方式：表格、结构化 XML、文字层、二维码 */
  confidence?: Confidence | "sheet";
  /** 从 PDF / OFD 里抽到的原始文字（用于人工核对识别是否正常） */
  text?: string;
}

type FieldKey =
  | "direction"
  | "kind"
  | "date"
  | "number"
  | "counterparty"
  | "category"
  | "amount"
  | "rate"
  | "tax"
  | "total";

const clean = (v: unknown) =>
  String(v ?? "")
    .replace(/[\s\u3000]/g, "")
    .replace(/[（）()【】\[\]]/g, "")
    .toLowerCase();

/**
 * 列名识别。按「越具体越先匹配」的顺序判断，避免「含税金额」误吃「不含税金额」这类子串陷阱。
 */
const MATCHERS: Array<[FieldKey, RegExp]> = [
  ["direction", /进销项|发票类型|收支|^类型$|方向/],
  ["kind", /发票种类|票种|发票类别|是否专|专票|普票/],
  ["date", /开票日期|日期|开票时间|开票日/],
  ["number", /发票号码|发票号|号码|票号/],
  ["amount", /不含税|未税|计税金额/],
  ["total", /价税合计|价税总计|含税金额|含税价|合计金额|总额/],
  ["rate", /税率|征收率|税点/],
  ["tax", /税额|税金|增值税额/],
  ["amount", /金额|价款/],
  ["category", /商品名称|货物名称|货物或应税劳务|品名|项目名称|费用类别|类别|摘要|商品/],
  ["counterparty", /对方单位|单位名称|对方名称|购方|销方|供应商|客户|往来单位|名称/],
];

function detectField(header: string): FieldKey | null {
  const h = clean(header);
  if (!h) return null;
  for (const [key, re] of MATCHERS) {
    if (re.test(h)) return key;
  }
  return null;
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "")
    .replace(/[¥￥,\s]/g, "")
    .replace(/元$/, "")
    .trim();
  if (!s || s === "-" || s === "—") return NaN;
  const n = Number(s);
  return isFinite(n) ? n : NaN;
}

function toRate(v: unknown): number {
  if (typeof v === "number") return v > 1 ? v : v === 0 ? 0 : v * 100;
  const s = String(v ?? "").trim();
  if (!s) return NaN;
  if (s.includes("免税") || s.includes("不征税") || s === "0") return 0;
  const n = toNumber(s.replace("%", ""));
  if (!isFinite(n)) return NaN;
  return s.includes("%") ? n : n > 1 ? n : n * 100;
}

function toDate(v: unknown): string {
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const ms = Math.round((v - 25569) * 86400000);
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  return "";
}

function toDirection(v: unknown, fallback?: Direction): Direction | undefined {
  const s = clean(v);
  if (!s) return fallback;
  if (s.includes("进") || s.includes("input") || s.includes("采购") || s.includes("成本")) return "input";
  if (s.includes("销") || s.includes("output") || s.includes("销售") || s.includes("收入")) return "output";
  return fallback;
}

function toKind(v: unknown): InvoiceKind | undefined {
  const s = clean(v);
  if (!s) return undefined;
  if (s.includes("专")) return "special";
  if (s.includes("普")) return "ordinary";
  return undefined;
}

/** 支持引号包裹、逗号换行的简易 CSV 解析 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === "," || ch === "\t" || ch === ";") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);

  if (rows.length && rows[0].length === 1 && rows[0][0].includes(",")) {
    return rows.map((r) => r[0].split(","));
  }
  return rows;
}

export function rowsToInvoices(rows: string[][]): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const invoices: Invoice[] = [];

  if (rows.length < 2) {
    return { invoices, errors: ["文件内容为空，或只有表头没有数据行。"], warnings, total: 0 };
  }

  const header = rows[0].map((h) => String(h ?? ""));
  const map: Partial<Record<FieldKey, number>> = {};
  header.forEach((h, idx) => {
    const key = detectField(h);
    if (key && map[key] === undefined) map[key] = idx;
  });

  if (map.amount === undefined && map.total === undefined && map.tax === undefined) {
    return {
      invoices,
      errors: [
        "没有识别到金额相关列。表头需包含「不含税金额」「价税合计」或「税额」之一，可用列名参考模板。",
      ],
      warnings,
      total: rows.length - 1,
    };
  }
  if (map.kind === undefined) {
    warnings.push("未识别到「发票种类」列，已默认按普通发票处理，进项税额不会自动抵扣。");
  }
  if (map.direction === undefined) {
    warnings.push("未识别到「发票类型」列，已默认按销项发票处理。");
  }

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const get = (key: FieldKey) => (map[key] !== undefined ? cells[map[key]!] : undefined);

    const direction = toDirection(get("direction"), "output");
    const kind = toKind(get("kind")) ?? "ordinary";
    const date = toDate(get("date"));
    const amount = toNumber(get("amount"));
    const tax = toNumber(get("tax"));
    const total = toNumber(get("total"));
    const rate = toRate(get("rate"));

    if (!isFinite(amount) && !isFinite(total) && !isFinite(tax)) {
      errors.push(`第 ${r + 1} 行：金额缺失，已跳过。`);
      continue;
    }
    if (!date) {
      errors.push(`第 ${r + 1} 行：开票日期无法识别，已跳过。`);
      continue;
    }

    const inv = completeInvoice({
      direction,
      kind,
      date,
      number: String(get("number") ?? "").trim(),
      counterparty: String(get("counterparty") ?? "").trim(),
      category: String(get("category") ?? "").trim(),
      amount,
      tax,
      total,
      rate: isFinite(rate) ? rate : undefined,
      checked: direction === "input" && kind === "special",
    });

    if (!inv.category) inv.category = "未分类";
    invoices.push(inv);
  }

  return { invoices, errors, warnings, total: rows.length - 1 };
}

export async function parseFile(file: File, companyName?: string): Promise<ParseResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt") || name.endsWith(".tsv")) {
    const text = await file.text();
    return { ...rowsToInvoices(parseCsv(text)), confidence: "sheet" };
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });
    return { ...rowsToInvoices(rows.map((row) => row.map((c) => String(c ?? "")))), confidence: "sheet" };
  }

  // 单票版式：PDF / OFD / XML / 图片
  const outcome = await parseDoc(file);
  if (!outcome.fields) {
    return {
      invoices: [],
      errors: outcome.errors,
      warnings: outcome.warnings,
      total: 1,
      confidence: outcome.confidence,
      text: outcome.text,
    };
  }
  const { invoice, warnings } = buildInvoice(outcome.fields, companyName);
  return {
    invoices: [invoice],
    errors: [],
    warnings: [...outcome.warnings, ...warnings],
    total: 1,
    confidence: outcome.confidence,
    text: outcome.text,
  };
}

export interface FileResult extends ParseResult {
  name: string;
  size: number;
}

/** 批量解析多个文件，逐个返回结果 */
export async function parseFiles(files: File[], companyName?: string): Promise<FileResult[]> {
  const out: FileResult[] = [];
  for (const file of files) {
    try {
      const res = await parseFile(file, companyName);
      out.push({ ...res, name: file.name, size: file.size });
    } catch {
      out.push({
        name: file.name,
        size: file.size,
        invoices: [],
        errors: ["文件解析失败，可能是文件损坏或格式不支持。"],
        warnings: [],
        total: 0,
      });
    }
  }
  return out;
}

export const TEMPLATE_HEADER = [
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
];

export const TEMPLATE_ROW = [
  "销项",
  "专票",
  "2026-10-08",
  "24322000000012345678",
  "示例客户有限公司",
  "技术服务费",
  "100000",
  "6",
  "6000",
  "106000",
];

export const TEMPLATE_CSV = `${TEMPLATE_HEADER.join(",")}\n${TEMPLATE_ROW.join(",")}\n`;

export function invoicesToCsv(invoices: Invoice[]): string {
  const lines = [TEMPLATE_HEADER.join(",")];
  for (const i of invoices) {
    lines.push(
      [
        i.direction === "output" ? "销项" : "进项",
        i.kind === "special" ? "专票" : "普票",
        i.date,
        i.number,
        i.counterparty,
        i.category,
        i.amount.toFixed(2),
        String(i.rate),
        i.tax.toFixed(2),
        i.total.toFixed(2),
      ]
        .map((c) => (/[",\n]/.test(c) ? `"${c.replaceAll('"', '""')}"` : c))
        .join(","),
    );
  }
  return lines.join("\n");
}
