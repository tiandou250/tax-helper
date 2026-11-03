import { parseCsv } from "./parse";
import { parseAmount } from "./format";
import { round2 } from "./types";

/* ------------------------------------------------------------------ */
/* 类型与科目表                                                        */
/* ------------------------------------------------------------------ */

export type StatementKind = "profit" | "balance" | "cashflow";

export interface LineDef {
  key: string;
  label: string;
  aliases: string[];
}

/** 利润表（也兼容「损益表」口径） */
export const PROFIT_LINES: LineDef[] = [
  { key: "revenue", label: "营业收入", aliases: ["营业总收入", "营业收入", "主营业务收入", "销售收入", "产品销售收入"] },
  { key: "cost", label: "营业成本", aliases: ["营业成本", "主营业务成本", "销售成本", "产品销售成本"] },
  { key: "taxSurcharge", label: "税金及附加", aliases: ["税金及附加", "营业税金及附加"] },
  { key: "selling", label: "销售费用", aliases: ["销售费用", "营业费用"] },
  { key: "admin", label: "管理费用", aliases: ["管理费用"] },
  { key: "rd", label: "研发费用", aliases: ["研发费用"] },
  { key: "finance", label: "财务费用", aliases: ["财务费用"] },
  { key: "otherIncome", label: "其他收益", aliases: ["其他收益"] },
  { key: "investmentIncome", label: "投资收益", aliases: ["投资收益"] },
  { key: "operatingProfit", label: "营业利润", aliases: ["营业利润"] },
  { key: "nonOpIncome", label: "营业外收入", aliases: ["营业外收入"] },
  { key: "nonOpExpense", label: "营业外支出", aliases: ["营业外支出"] },
  { key: "totalProfit", label: "利润总额", aliases: ["利润总额"] },
  { key: "incomeTaxExpense", label: "所得税费用", aliases: ["所得税费用"] },
  { key: "netProfit", label: "净利润", aliases: ["净利润"] },
];

/** 资产负债表 */
export const BALANCE_LINES: LineDef[] = [
  { key: "cash", label: "货币资金", aliases: ["货币资金", "库存现金"] },
  { key: "receivable", label: "应收账款", aliases: ["应收账款"] },
  { key: "prepaid", label: "预付款项", aliases: ["预付款项", "预付账款"] },
  { key: "inventory", label: "存货", aliases: ["存货"] },
  { key: "currentAssets", label: "流动资产合计", aliases: ["流动资产合计"] },
  { key: "fixedAssets", label: "固定资产", aliases: ["固定资产"] },
  { key: "totalAssets", label: "资产总计", aliases: ["资产总计", "资产合计"] },
  { key: "shortLoan", label: "短期借款", aliases: ["短期借款"] },
  { key: "payable", label: "应付账款", aliases: ["应付账款"] },
  { key: "salaryPayable", label: "应付职工薪酬", aliases: ["应付职工薪酬", "应付工资"] },
  { key: "taxPayable", label: "应交税费", aliases: ["应交税费", "应交税金"] },
  { key: "currentLiab", label: "流动负债合计", aliases: ["流动负债合计"] },
  { key: "totalLiab", label: "负债合计", aliases: ["负债合计"] },
  { key: "capital", label: "实收资本", aliases: ["实收资本", "股本", "实收资本（或股本）"] },
  { key: "retained", label: "未分配利润", aliases: ["未分配利润"] },
  { key: "totalEquity", label: "所有者权益合计", aliases: ["所有者权益合计", "股东权益合计"] },
  {
    key: "totalLiabEquity",
    label: "负债和所有者权益总计",
    aliases: [
      "负债和所有者权益总计",
      "负债和所有者权益合计",
      "负债及所有者权益总计",
      "负债及所有者权益合计",
      "负债和股东权益总计",
      "负债及股东权益总计",
    ],
  },
];

/** 现金流量表 */
export const CASHFLOW_LINES: LineDef[] = [
  { key: "salesCash", label: "销售商品、提供劳务收到的现金", aliases: ["销售商品、提供劳务收到的现金", "销售商品提供劳务收到的现金"] },
  { key: "taxRefund", label: "收到的税费返还", aliases: ["收到的税费返还"] },
  { key: "cashIn", label: "经营活动现金流入小计", aliases: ["经营活动现金流入小计"] },
  { key: "purchaseCash", label: "购买商品、接受劳务支付的现金", aliases: ["购买商品、接受劳务支付的现金", "购买商品接受劳务支付的现金"] },
  { key: "staffCash", label: "支付给职工以及为职工支付的现金", aliases: ["支付给职工以及为职工支付的现金"] },
  { key: "taxPaid", label: "支付的各项税费", aliases: ["支付的各项税费"] },
  { key: "cashOut", label: "经营活动现金流出小计", aliases: ["经营活动现金流出小计"] },
  { key: "operatingNet", label: "经营活动产生的现金流量净额", aliases: ["经营活动产生的现金流量净额"] },
  { key: "investingNet", label: "投资活动产生的现金流量净额", aliases: ["投资活动产生的现金流量净额"] },
  { key: "financingNet", label: "筹资活动产生的现金流量净额", aliases: ["筹资活动产生的现金流量净额"] },
  { key: "netIncrease", label: "现金及现金等价物净增加额", aliases: ["现金及现金等价物净增加额"] },
  { key: "endingCash", label: "期末现金及现金等价物余额", aliases: ["期末现金及现金等价物余额"] },
];

export const LINES: Record<StatementKind, LineDef[]> = {
  profit: PROFIT_LINES,
  balance: BALANCE_LINES,
  cashflow: CASHFLOW_LINES,
};

export const KIND_LABEL: Record<StatementKind, string> = {
  profit: "利润表",
  balance: "资产负债表",
  cashflow: "现金流量表",
};

/** 各表在界面与导出里展示的关键指标（顺序即展示顺序） */
export const KEY_METRICS: Record<StatementKind, string[]> = {
  profit: ["revenue", "cost", "taxSurcharge", "expenses", "totalProfit", "incomeTaxExpense", "netProfit"],
  balance: ["cash", "receivable", "inventory", "totalAssets", "totalLiab", "totalEquity", "taxPayable"],
  cashflow: ["salesCash", "taxPaid", "operatingNet", "endingCash"],
};

/** 指标名称：expenses 是派生项，其余查科目字典 */
export function metricLabel(kind: StatementKind, key: string): string {
  if (key === "expenses") return "期间费用合计";
  return LINES[kind].find((l) => l.key === key)?.label ?? key;
}

/** 取关键指标金额（含派生项） */
export function metricValue(doc: StatementDoc, key: string): number | undefined {
  if (key === "expenses" && doc.kind === "profit") return summarizeProfit(doc).expenses;
  return doc.items[key];
}

export interface StatementVariant {
  label: string;
  items: Record<string, number>;
}

export interface StatementDoc {
  id: string;
  kind: StatementKind;
  /** YYYY-MM 或 YYYY；无法识别时为空字符串 */
  period: string;
  source: string;
  items: Record<string, number>;
  /** 取数口径（如「期末数」「本年累计」），与所选 variant 对应 */
  variantLabel?: string;
  /** 同一张表的不同口径：期末/年初、本月/本年累计… */
  variants?: StatementVariant[];
  warnings: string[];
  /** 未能归类的原始行（便于核对是否漏项） */
  unmatched?: string[];
}

/* ------------------------------------------------------------------ */
/* 文本归一化与科目匹配                                                */
/* ------------------------------------------------------------------ */

const normLabel = (s: string): string =>
  String(s ?? "")
    .replace(/[\s\u3000]/g, "")
    .replace(/^[（(]?[一二三四五六七八九十\d]+[)）]?[、.．]/, "")
    .replace(/^(其中|减|加)[:：]?/, "")
    .replace(/[:：]/g, "")
    .replace(/[（(]元[)）]/g, "")
    .trim();

/** 每个 key 取它最长的别名做匹配，避免「营业收入」吃掉「营业总收入」这类包含关系 */
const MATCH_INDEX: Record<StatementKind, { alias: string; key: string }[]> = {
  profit: buildIndex(PROFIT_LINES),
  balance: buildIndex(BALANCE_LINES),
  cashflow: buildIndex(CASHFLOW_LINES),
};

function buildIndex(defs: LineDef[]) {
  const pairs: { alias: string; key: string }[] = [];
  for (const d of defs) for (const a of d.aliases) pairs.push({ alias: normLabel(a), key: d.key });
  return pairs.sort((a, b) => b.alias.length - a.alias.length);
}

function matchKey(kind: StatementKind, label: string): string | null {
  const n = normLabel(label);
  if (!n || n.length > 40) return null;
  for (const p of MATCH_INDEX[kind]) if (n.includes(p.alias)) return p.key;
  return null;
}

/* ------------------------------------------------------------------ */
/* 报表类型与期间识别                                                  */
/* ------------------------------------------------------------------ */

const SCORE: Record<StatementKind, RegExp[]> = {
  cashflow: [
    /经营活动产生的现金流量净额/,
    /经营活动现金流入小计/,
    /销售商品[、,，]?提供劳务收到的现金/,
    /现金及现金等价物/,
  ],
  balance: [/资产总计|资产合计/, /负债合计/, /所有者权益合计/, /流动资产合计/, /应交税费/],
  profit: [/营业收入/, /营业成本/, /利润总额/, /净利润/, /税金及附加/, /销售费用/],
};

export function detectKind(text: string): StatementKind | null {
  const flat = text.replace(/[\s\u3000]/g, "");
  let best: StatementKind | null = null;
  let bestScore = 0;
  (Object.keys(SCORE) as StatementKind[]).forEach((k) => {
    const score = SCORE[k].filter((re) => re.test(flat)).length;
    if (score > bestScore) {
      best = k;
      bestScore = score;
    }
  });
  return bestScore >= 2 ? best : null;
}

/** 从标题/表头里抓期间："2026年10月31日" → 2026-10，"2026年度" → 2026 */
export function detectPeriod(text: string): string {
  const head = text.split("\n").slice(0, 6).join(" ") || text.slice(0, 200);
  const pick = (s: string): string => {
    const m =
      s.match(/(\d{4})\s*年\s*(\d{1,2})\s*月/) ??
      s.match(/(\d{4})[-/.](\d{1,2})(?![\d])/);
    if (m) {
      const mon = Number(m[2]);
      if (mon >= 1 && mon <= 12) return `${m[1]}-${String(mon).padStart(2, "0")}`;
    }
    const y = s.match(/(\d{4})\s*年度?/);
    if (y) return y[1];
    return "";
  };
  return pick(head) || pick(text);
}

/* ------------------------------------------------------------------ */
/* 表格解析                                                            */
/* ------------------------------------------------------------------ */

const LABEL_HEADER = /^(项目|资产|负债和所有者权益|负债及所有者权益|负债和股东权益|所有者权益|科目|项目名称)$/;
/**
 * 取值列的表头。真实报表写法比想象中杂：
 * 资产负债表常用「年初数 / 期末数」，利润表用「本月数 / 本年累计 / 上年累计」，
 * 也有软件写「本期金额 / 上期金额」。少认一种就会退化成「取到行次」。
 */
const VALUE_HEADER =
  /(期末余额|期末数|年末余额|年末数|年初余额|年初数|本期金额|本期发生额|上期金额|上期发生额|本月数|本月金额|本月发生|本年累计数?|上年累计数?|上年同期|金额)/;
const SKIP_HEADER = /^(行次|行号|附注|项目序号)$/;

/** 把各种表头归一到统一口径 */
const CANON_RULES: { re: RegExp; key: string }[] = [
  { re: /本年累计/, key: "本年累计" },
  { re: /上年累计|上年同期/, key: "上年累计" },
  { re: /期末(余额|数)|年末(余额|数)/, key: "期末" },
  { re: /年初(余额|数)/, key: "年初" },
  { re: /本月(数|金额|发生)|本期(金额|发生额)/, key: "本期" },
  { re: /上期(金额|发生额)/, key: "上期" },
  { re: /金额/, key: "金额" },
];

const canonColumn = (header: string): string | null => {
  const h = header.replace(/[\s\u3000]/g, "");
  for (const r of CANON_RULES) if (r.re.test(h)) return r.key;
  return null;
};

/** 默认取数口径：优先「本年累计」，其次「期末」，再看「本期」 */
const DEFAULT_ORDER = ["本年累计", "期末", "本期", "金额", "上年累计", "年初", "上期"];

interface Column {
  index: number;
  role: "label" | "value" | "skip";
  header: string;
  /** 归一后的口径名，如「期末」「本年累计」 */
  canon: string | null;
  /** 原表头文字，用于在界面上显示「期末数 / 本年累计」 */
  raw: string;
}

function buildColumns(header: string[]): Column[] {
  return header.map((h, index) => {
    const raw = String(h ?? "").trim();
    const t = raw.replace(/[\s\u3000]/g, "");
    if (SKIP_HEADER.test(t)) return { index, role: "skip" as const, header: t, canon: null, raw };
    if (LABEL_HEADER.test(t)) return { index, role: "label" as const, header: t, canon: null, raw };
    if (VALUE_HEADER.test(t)) return { index, role: "value" as const, header: t, canon: canonColumn(t), raw };
    return { index, role: "skip" as const, header: t, canon: null, raw };
  });
}

const findHeaderRow = (rows: string[][]): number => {
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const cols = buildColumns(rows[i]);
    if (cols.some((c) => c.role === "label") && cols.some((c) => c.role === "value")) return i;
  }
  return -1;
};

/** 把表格行解析成科目金额 */
export function parseStatementRows(rows: string[][], source: string): StatementDoc | null {
  const grid = rows.map((r) => r.map((c) => String(c ?? "").trim()));
  const text = grid.map((r) => r.join(" ")).join("\n");
  const kind = detectKind(text);
  if (!kind) return null;

  const headerIdx = findHeaderRow(grid);
  const unmatched: string[] = [];
  const warnings: string[] = [];

  /** 口径 → 科目金额。同一口径可能出现在左右两栏，按列归并 */
  const buckets = new Map<string, Record<string, number>>();
  const labels: Record<string, string> = {};

  const put = (canon: string, key: string, value: number) => {
    const bucket = buckets.get(canon) ?? {};
    if (!(key in bucket)) bucket[key] = round2(value);
    buckets.set(canon, bucket);
  };

  if (headerIdx >= 0) {
    const cols = buildColumns(grid[headerIdx]);
    const labelCols = cols.filter((c) => c.role === "label").map((c) => c.index);
    const valueCols = cols.filter((c) => c.role === "value" && c.canon);

    // 记录每个口径在表里的原始写法，界面上显示「期末数」而不是「期末」
    for (const c of valueCols) if (c.canon && !labels[c.canon]) labels[c.canon] = c.raw;

    for (let r = headerIdx + 1; r < grid.length; r++) {
      const row = grid[r];
      const labelsInRow = labelCols.filter((c) => normLabel(row[c] ?? "").length > 0);
      labelsInRow.forEach((labelIdx, n) => {
        const label = row[labelIdx] ?? "";
        const key = matchKey(kind, label);
        const nextLabel = labelsInRow[n + 1] ?? Infinity;
        // 只在「本标签列」与「下一个标签列」之间取数，避免资产负债表左右两栏串位
        const candidates = valueCols.filter((c) => c.index > labelIdx && c.index < nextLabel);
        let hit = false;
        for (const c of candidates) {
          const v = parseAmount(row[c.index] ?? "");
          if (v === undefined) continue;
          hit = true;
          if (key && c.canon) put(c.canon, key, v);
        }
        if (!key && hit && label.trim()) unmatched.push(label.trim());
      });
    }
  } else {
    // 无表头：逐行找「科目名 + 紧随其后的数字」，统一放进「金额」口径
    for (const row of grid) {
      if (row.length === 1) {
        const m = row[0].match(/^(.{2,30}?)[：:]\s*([(（]?-?[\d,]+(?:\.\d+)?[)）]?)\s*$/);
        if (m) {
          const key = matchKey(kind, m[1]);
          const v = parseAmount(m[2]);
          if (key && v !== undefined) put("金额", key, v);
        }
        continue;
      }
      row.forEach((cell, i) => {
        const key = matchKey(kind, cell);
        if (!key) return;
        for (let j = i + 1; j < Math.min(i + 4, row.length); j++) {
          const v = parseAmount(row[j]);
          if (v !== undefined) {
            put("金额", key, v);
            break;
          }
        }
      });
    }
    labels["金额"] = "金额";
    if (buckets.size === 0) {
      warnings.push("没能在文件里找到可识别的科目行，请确认导出的是标准三表，或改用「手工填入」。");
    }
  }

  // 按默认优先级排序口径，第一个作为默认取数
  const order = (c: string) => {
    const i = DEFAULT_ORDER.indexOf(c);
    return i < 0 ? 99 : i;
  };
  const variants: StatementVariant[] = [...buckets.entries()]
    .filter(([, items]) => Object.keys(items).length > 0)
    .sort((a, b) => order(a[0]) - order(b[0]))
    .map(([canon, items]) => ({ label: labels[canon] ?? canon, items }));

  if (variants.length === 0) return null;

  const primary = variants[0];
  const items = primary.items;

  if (Object.keys(items).length < 3) warnings.push("只识别到少量科目，建议核对后再用于算税。");
  if (variants.length > 1) {
    warnings.push(
      `表里有 ${variants.length} 组数据（${variants.map((v) => v.label).join(" / ")}），当前取「${primary.label}」，可在导入窗口切换。`,
    );
  }

  const period = detectPeriod(text);
  if (!period) warnings.push("没能从表头识别所属期间，已归入当前期间，可在报表卡片上修改。");

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    period,
    source,
    items,
    variantLabel: primary.label,
    variants,
    warnings,
    unmatched: unmatched.slice(0, 12),
  };
}

/** 粘贴文本 / CSV 文本 */
export function parseStatementText(text: string, source = "粘贴文本"): StatementDoc | null {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  // 「营业收入：1,000,000.00」这种一行一个科目的写法，直接按 CSV 拆会被千分位逗号打散
  const kv = /^(.{2,30}?)[：:]\s*([(（]?-?[\d,]+(?:\.\d+)?[)）]?)\s*$/;
  const kvLines = lines.filter((l) => kv.test(l.trim()));
  const rows =
    kvLines.length >= 3
      ? lines.map((l) => {
          const m = l.trim().match(kv);
          if (m) return [m[1], m[2]];
          return parseCsv(l)[0] ?? [l];
        })
      : parseCsv(text);

  if (rows.length === 0) return null;
  return parseStatementRows(rows, source);
}

/** xlsx / xls / csv 文件，逐个工作表尝试 */
export async function parseStatementFile(file: File): Promise<StatementDoc[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt") || name.endsWith(".tsv")) {
    const doc = parseStatementText(await file.text(), file.name);
    return doc ? [doc] : [];
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".et")) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const out: StatementDoc[] = [];
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });
      const doc = parseStatementRows(
        rows.map((r) => r.map((c) => (c === null || c === undefined ? "" : String(c)))),
        `${file.name} · ${sheetName}`,
      );
      if (doc) out.push(doc);
    }
    return out;
  }
  return [];
}

/* ------------------------------------------------------------------ */
/* 手工录入                                                            */
/* ------------------------------------------------------------------ */

export function manualStatement(
  kind: StatementKind,
  period: string,
  values: Record<string, number>,
): StatementDoc {
  const items: Record<string, number> = {};
  for (const [k, v] of Object.entries(values)) {
    if (typeof v === "number" && isFinite(v)) items[k] = round2(v);
  }
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    period,
    source: "手工录入",
    items,
    warnings: [],
  };
}

/* ------------------------------------------------------------------ */
/* 取用与汇总                                                          */
/* ------------------------------------------------------------------ */

/** 按当前期间挑三张表：同期间优先，其次最近一期 */
export function pickStatements(list: StatementDoc[], period: string) {
  const pick = (kind: StatementKind): StatementDoc | undefined => {
    const same = list.filter((s) => s.kind === kind);
    if (same.length === 0) return undefined;
    const exact = same.filter((s) => s.period === period);
    if (exact.length) return exact[exact.length - 1];
    const within = same.filter((s) => period && s.period && s.period.startsWith(period.slice(0, 4)));
    const pool = within.length ? within : same;
    return [...pool].sort((a, b) => (a.period || "").localeCompare(b.period || "")).pop();
  };
  return { profit: pick("profit"), balance: pick("balance"), cashflow: pick("cashflow") };
}

export interface ProfitFigures {
  revenue: number;
  cost: number;
  taxSurcharge: number;
  selling: number;
  admin: number;
  rd: number;
  finance: number;
  /** 期间费用合计 = 销售 + 管理 + 研发 + 财务 */
  expenses: number;
  otherIncome: number;
  investmentIncome: number;
  nonOpIncome: number;
  nonOpExpense: number;
  /** 利润总额：优先取表内值，缺失时按科目推算 */
  totalProfit: number;
  totalProfitFromBook: boolean;
  incomeTaxExpense?: number;
  netProfit?: number;
  /** 是否有足够的科目用于算税 */
  usable: boolean;
}

export function summarizeProfit(doc: StatementDoc): ProfitFigures {
  const n = (k: string) => Number(doc.items[k] ?? 0);
  const has = (k: string) => k in doc.items;

  const revenue = n("revenue");
  const cost = n("cost");
  const taxSurcharge = n("taxSurcharge");
  const selling = n("selling");
  const admin = n("admin");
  const rd = n("rd");
  const finance = n("finance");
  const expenses = round2(selling + admin + rd + finance);
  const otherIncome = n("otherIncome");
  const investmentIncome = n("investmentIncome");
  const nonOpIncome = n("nonOpIncome");
  const nonOpExpense = n("nonOpExpense");

  const derived = round2(
    revenue - cost - taxSurcharge - expenses + otherIncome + investmentIncome + nonOpIncome - nonOpExpense,
  );
  const totalProfitFromBook = has("totalProfit");
  const totalProfit = has("totalProfit") ? n("totalProfit") : derived;

  return {
    revenue,
    cost,
    taxSurcharge,
    selling,
    admin,
    rd,
    finance,
    expenses,
    otherIncome,
    investmentIncome,
    nonOpIncome,
    nonOpExpense,
    totalProfit,
    totalProfitFromBook,
    incomeTaxExpense: has("incomeTaxExpense") ? n("incomeTaxExpense") : undefined,
    netProfit: has("netProfit") ? n("netProfit") : undefined,
    usable: has("revenue") && totalProfit !== 0,
  };
}

/* ------------------------------------------------------------------ */
/* 勾稽核对：报表口径 vs 发票口径                                       */
/* ------------------------------------------------------------------ */

export interface DiffRow {
  label: string;
  book: number | undefined;
  invoice: number | undefined;
  diff: number;
  level: "ok" | "warn" | "info";
  note: string;
}

export interface InvoiceTotals {
  outputAmount: number;
  inputAmount: number;
  outputTax: number;
  inputTax: number;
  vatPayable: number;
  surchargeTotal: number;
  stampDuty: number;
  total: number;
}

export function reconcile(
  docs: { profit?: StatementDoc; balance?: StatementDoc; cashflow?: StatementDoc },
  inv: InvoiceTotals,
): DiffRow[] {
  const rows: DiffRow[] = [];
  const push = (
    label: string,
    book: number | undefined,
    invoice: number | undefined,
    note: string,
    tolerance = 1,
  ) => {
    if (book === undefined) return;
    const b = invoice === undefined ? 0 : invoice;
    const diff = round2((book ?? 0) - b);
    const level: DiffRow["level"] = Math.abs(diff) <= tolerance ? "ok" : "warn";
    rows.push({ label, book, invoice, diff, level, note });
  };

  if (docs.profit) {
    const p = summarizeProfit(docs.profit);
    push("营业收入 vs 发票不含税销售额", p.revenue, inv.outputAmount, "差异通常来自未开票收入、其他业务收入或跨期收入");
    push("营业成本 vs 发票采购（不含税）", p.cost, inv.inputAmount, "差异通常来自无票成本、人工成本与折旧");
    const bookSurcharge = round2(p.taxSurcharge);
    push("税金及附加 vs 测算附加税+印花税", bookSurcharge, round2(inv.surchargeTotal + inv.stampDuty), "账簿数含已缴与计提差异");
  }

  if (docs.balance) {
    const b = docs.balance.items;
    if (b.taxPayable !== undefined) {
      push("期末应交税费 vs 本期应缴合计", b.taxPayable, inv.total, "若为 0 说明本期税费已缴清", 5);
    }
    if (b.totalAssets !== undefined && b.totalLiabEquity !== undefined) {
      const gap = round2(b.totalAssets - b.totalLiabEquity);
      rows.push({
        label: "资产总计 vs 负债和所有者权益总计",
        book: b.totalAssets,
        invoice: b.totalLiabEquity,
        diff: gap,
        level: Math.abs(gap) < 1 ? "ok" : "warn",
        note: "资产负债表自身的平衡校验，不平衡说明数据有误",
      });
    }
  }

  if (docs.cashflow) {
    const c = docs.cashflow.items;
    if (c.salesCash !== undefined) {
      push("销售收现 vs 发票价税合计（销项）", c.salesCash, round2(inv.outputAmount + inv.outputTax), "差额体现回款进度与应收余额", 5);
    }
    if (c.taxPaid !== undefined) {
      push("支付的各项税费 vs 本期应缴合计", c.taxPaid, inv.total, "差额多为缴纳上期税款", 5);
    }
  }

  return rows;
}
