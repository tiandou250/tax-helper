import type { Direction, Invoice, InvoiceKind } from "./types";
import { completeInvoice } from "./types";

export type Confidence = "structured" | "text" | "qr";

export interface DocFields {
  number?: string;
  code?: string;
  date?: string;
  buyer?: string;
  seller?: string;
  total?: number;
  amount?: number;
  tax?: number;
  rate?: number;
  itemName?: string;
  kind?: InvoiceKind;
  rawText?: string;
}

export interface DocOutcome {
  fields: DocFields | null;
  confidence: Confidence;
  warnings: string[];
  errors: string[];
  text?: string;
}

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

const num = (v?: string | number | null): number | undefined => {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "number") return isFinite(v) ? v : undefined;
  const s = v.replace(/[¥￥,\s]/g, "");
  if (!s) return undefined;
  const n = Number(s);
  return isFinite(n) ? n : undefined;
};

const normRate = (v?: string | number | null): number | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v === "number") return v > 1 ? v : v === 0 ? 0 : v * 100;
  const s = String(v).trim();
  if (!s) return undefined;
  if (/免税|不征/.test(s)) return 0;
  const n = num(s.replace("%", ""));
  if (n === undefined) return undefined;
  return s.includes("%") ? n : n > 1 ? n : n * 100;
};

/** "2026年10月08日" / "2026-10-08 10:20:30" / "20261008" → "2026-10-08" */
const normDate = (v?: string | null): string | undefined => {
  if (!v) return undefined;
  const s = String(v).trim();
  const cn = s.match(/(\d{4})\s*[年\-/.]\s*(\d{1,2})\s*[月\-/.]\s*(\d{1,2})/);
  if (cn) return `${cn[1]}-${cn[2].padStart(2, "0")}-${cn[3].padStart(2, "0")}`;
  const ymd = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  return undefined;
};

/* ------------------------------------------------------------------ */
/* XML                                                                 */
/* ------------------------------------------------------------------ */

const ALIASES: Record<keyof DocFields, string[]> = {
  number: ["InvoiceNumber", "发票号码", "FPHM", "EinvoiceNumber", "InvoiceNo"],
  code: ["InvoiceCode", "发票代码", "FPДМ", "FPDA", "InvoiceCodeValue"],
  date: ["IssueTime", "开票日期", "KPRQ", "IssueDate", "InvoiceDate", "BillingTime"],
  buyer: ["BuyerName", "购买方名称", "购方名称", "GFMC", "PurchaserName", "Buyer"],
  seller: ["SellerName", "销售方名称", "销方名称", "XFMC", "SupplierName", "Seller"],
  total: [
    "TotalTax-includedAmount",
    "TotalTaxIncludedAmount",
    "TotalAmWithTax",
    "价税合计",
    "价税合计金额",
    "JSHJ",
    "TotalAmountWithTax",
  ],
  amount: ["TotalAmWithoutTax", "合计金额", "HJJE", "TotalAmountWithoutTax", "AmountWithoutTax"],
  tax: ["TotalTaxAm", "合计税额", "HJSE", "TotalTaxAmount", "TaxAmount"],
  rate: ["TaxRate", "税率", "SL", "TaxRateValue"],
  itemName: ["ItemName", "货物或应税劳务名称", "项目名称", "GoodsName", "ItemNameValue"],
  kind: [],
  rawText: [],
};

function collect(doc: Document, names: string[]): string[] {
  const out: string[] = [];
  const all = doc.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) {
    const el = all[i] as Element;
    if (names.includes(el.localName)) {
      const t = (el.textContent ?? "").trim();
      if (t) out.push(t);
    }
  }
  return out;
}

function first(doc: Document, names: string[]): string | undefined {
  return collect(doc, names)[0];
}

/** 解析结构化发票 XML（数电票 / 税控盘 / 增值税电子发票） */
export function parseInvoiceXml(xml: string): DocFields | null {
  if (!/InvoiceNumber|发票号码|FPHM|EInvoice|FPXX/i.test(xml)) return null;

  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.getElementsByTagName("parsererror").length) return null;

  const number = first(doc, ALIASES.number);
  const total = num(first(doc, ALIASES.total));
  if (!number && total === undefined) return null;

  const rates = collect(doc, ALIASES.rate)
    .map((r) => normRate(r))
    .filter((r): r is number => r !== undefined && r >= 0);
  const items = collect(doc, ALIASES.itemName);

  const kindHint: InvoiceKind | undefined = /专用发票/.test(xml)
    ? "special"
    : /普通发票/.test(xml)
      ? "ordinary"
      : undefined;

  return {
    number,
    code: first(doc, ALIASES.code),
    date: normDate(first(doc, ALIASES.date)),
    buyer: first(doc, ALIASES.buyer),
    seller: first(doc, ALIASES.seller),
    total,
    amount: num(first(doc, ALIASES.amount)),
    tax: num(first(doc, ALIASES.tax)),
    rate: rates[0],
    itemName: items[0],
    kind: kindHint,
  };
}

/* ------------------------------------------------------------------ */
/* 版式文本（PDF / OFD 文字层）                                        */
/* ------------------------------------------------------------------ */

/** 截断到下一个字段标签，避免把同行的其它内容吃进名称里 */
const cleanName = (s: string) => {
  let out = s;
  for (const m of [
    "统一社会",
    "纳税人",
    "项目名称",
    "货物或应税",
    "合计",
    "价税",
    "开票日期",
    "名称",
    "销售方",
    "购买方",
    "地址",
    "开户行",
    "税率",
    "金额",
    "税额",
  ]) {
    const i = out.indexOf(m);
    if (i > 0) out = out.slice(0, i);
  }
  return out.replace(/[：:\s]+$/, "").trim();
};

export function extractFromText(raw: string): DocFields | null {
  const text = raw.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ");
  const flat = text.replace(/\s+/g, "");

  const number =
    flat.match(/发票号码[：:]?(\d{8,25})/)?.[1] ??
    flat.match(/(?:InvoiceNumber|No\.?)[：:]?(\d{8,25})/i)?.[1];
  const date =
    normDate(text.match(/开票日期[：:]?\s*([0-9年月日\-/.\s]{8,14})/)?.[1]) ??
    normDate(text.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/)?.[0]);
  const total =
    num(flat.match(/[（(]小写[)）][：:]?[¥￥]?([\d,]+\.\d{2})/)?.[1]) ??
    num(flat.match(/价税合计[^0-9]{0,14}[¥￥]?([\d,]+\.\d{2})/)?.[1]);

  const sum = flat.match(/合计[¥￥]?([\d,]+\.\d{2})[¥￥]?([\d,]+\.\d{2})/);
  const amount = num(sum?.[1]);
  const tax = num(sum?.[2]);

  const rate = normRate(flat.match(/(\d{1,2})%/)?.[1]);

  // 名称：优先按「购买方 / 销售方」分块，再退回「名称：」出现顺序
  const buyerRaw =
    text.match(/购买方[^\n]{0,20}?名称[：:]\s*([^\n]+)/)?.[1] ??
    text.match(/购方[^\n]{0,12}?名称[：:]\s*([^\n]+)/)?.[1];
  const sellerRaw =
    text.match(/销售方[^\n]{0,20}?名称[：:]\s*([^\n]+)/)?.[1] ??
    text.match(/销方[^\n]{0,12}?名称[：:]\s*([^\n]+)/)?.[1];

  const allNames = [...text.matchAll(/名称[：:]\s*([^\n]+)/g)]
    .map((m) => cleanName(m[1]))
    .filter((s) => s.length >= 2);

  const buyer = buyerRaw ? cleanName(buyerRaw) : allNames[0];
  const seller = sellerRaw ? cleanName(sellerRaw) : allNames[1];

  const itemRaw = text.match(/项目名称[：:]?\s*([^\n]+)/)?.[1];
  const itemName = itemRaw ? cleanName(itemRaw).slice(0, 20) : undefined;

  if (!number && total === undefined) return null;

  return {
    number,
    date,
    buyer,
    seller,
    total,
    amount,
    tax,
    rate,
    itemName,
    kind: /专用发票/.test(flat) ? "special" : /普通发票/.test(flat) ? "ordinary" : undefined,
    rawText: text.slice(0, 4000),
  };
}

/* ------------------------------------------------------------------ */
/* OFD                                                                 */
/* ------------------------------------------------------------------ */

export async function parseOfd(file: File): Promise<DocOutcome> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const xmlNames = Object.keys(zip.files).filter(
    (n) => /\.xml$/i.test(n) && !zip.files[n].dir && !/OFD\.xml$/i.test(n),
  );

  // 1. 优先找内嵌的结构化发票 XML
  for (const name of xmlNames) {
    const txt = await zip.files[name].async("string");
    if (/InvoiceNumber|发票号码|FPHM/.test(txt)) {
      const fields = parseInvoiceXml(txt);
      if (fields) {
        return { fields, confidence: "structured", warnings: [], errors: [], text: txt.slice(0, 2000) };
      }
    }
  }

  // 2. 退化为读取版式文字层
  const chunks: { x: number; y: number; s: string }[] = [];
  for (const name of xmlNames.filter((n) => /content.*\.xml$/i.test(n))) {
    const txt = await zip.files[name].async("string");
    const re = /<[^>]*TextCode\b([^>]*)>([\s\S]*?)<\/[^>]*TextCode>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(txt))) {
      const attrs = m[1];
      const x = Number(attrs.match(/\bX="([\d.-]+)"/)?.[1] ?? 0);
      const y = Number(attrs.match(/\bY="([\d.-]+)"/)?.[1] ?? 0);
      const s = m[2].replace(/<[^>]+>/g, "").trim();
      if (s) chunks.push({ x, y, s });
    }
  }

  if (chunks.length === 0) {
    return {
      fields: null,
      confidence: "text",
      warnings: [],
      errors: ["OFD 内没有找到可读文字层，可能是纯图片版式，请改用 PDF 或手工录入。"],
    };
  }

  // OFD 坐标原点在左上、Y 向下，按 Y 升序还原行
  chunks.sort((a, b) => a.y - b.y || a.x - b.x);
  let line = "";
  let curY: number | null = null;
  const lines: string[] = [];
  for (const c of chunks) {
    if (curY === null || Math.abs(c.y - curY) > 2) {
      if (line) lines.push(line);
      line = c.s;
      curY = c.y;
    } else line += c.s;
  }
  if (line) lines.push(line);

  const text = lines.join("\n");
  const fields = extractFromText(text);
  if (!fields) {
    return {
      fields: null,
      confidence: "text",
      warnings: [],
      errors: ["OFD 文字层未能识别出票面要素，请核对后手工补录。"],
      text,
    };
  }
  return { fields, confidence: "text", warnings: ["依据版式文字层识别，税额与税率请核对。"], errors: [], text };
}

/* ------------------------------------------------------------------ */
/* PDF                                                                 */
/* ------------------------------------------------------------------ */

export async function parsePdf(file: File): Promise<DocOutcome> {
  const pdfjs = await import("pdfjs-dist");
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  pdfjs.GlobalWorkerOptions.workerSrc = `${base}/pdf.worker.min.mjs`;

  const doc = await pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
  }).promise;

  const pages: string[] = [];
  const max = Math.min(doc.numPages, 6);
  for (let i = 1; i <= max; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items = content.items
      .map((it) => {
        const item = it as { str?: string; transform?: number[] };
        if (!item.str || !item.transform) return null;
        return { s: item.str, x: item.transform[4], y: item.transform[5] };
      })
      .filter((v): v is { s: string; x: number; y: number } => Boolean(v?.s.trim()));

    items.sort((a, b) => b.y - a.y || a.x - b.x);
    let line = "";
    let curY: number | null = null;
    const lines: string[] = [];
    for (const it of items) {
      if (curY === null || Math.abs(it.y - curY) > 3) {
        if (line) lines.push(line);
        line = it.s;
        curY = it.y;
      } else line += it.s;
    }
    if (line) lines.push(line);
    pages.push(lines.join("\n"));
  }
  await doc.destroy();

  const text = pages.join("\n");
  const fields = extractFromText(text);
  if (!fields) {
    return {
      fields: null,
      confidence: "text",
      warnings: [],
      errors: [
        "PDF 没有可提取的文字层（多半是扫描件），请上传该发票的 OFD / XML 原件，或使用手工录入。",
      ],
      text: text.slice(0, 500),
    };
  }
  return {
    fields,
    confidence: "text",
    warnings: ["依据 PDF 文字层识别，税率与购买方信息请核对。"],
    errors: [],
    text,
  };
}

/* ------------------------------------------------------------------ */
/* 图片（二维码兜底）                                                  */
/* ------------------------------------------------------------------ */

export async function parseImage(file: File): Promise<DocOutcome> {
  const { default: jsQR } = await import("jsqr");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return { fields: null, confidence: "qr", warnings: [], errors: ["浏览器不支持图片解码。"] };
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const qr = jsQR(data.data, w, h, { inversionAttempts: "attemptBoth" });

  if (!qr) {
    return {
      fields: null,
      confidence: "qr",
      warnings: [],
      errors: [
        "图片未识别到发票二维码。照片版发票需要 OCR 才能自动读取，当前请用手工录入（4 个字段即可）。",
      ],
    };
  }

  // 增值税发票二维码：01,10,发票代码,发票号码,金额,开票日期,校验码,...
  const parts = qr.data.split(",");
  if (parts.length >= 6 && /^\d{1,2}$/.test(parts[0])) {
    const fields: DocFields = {
      code: parts[2] || undefined,
      number: parts[3] || undefined,
      total: num(parts[4]),
      date: normDate(parts[5]),
      rawText: qr.data,
    };
    return {
      fields,
      confidence: "qr",
      warnings: ["根据发票二维码识别出票号与价税合计，税率、税额与对方单位请补录。"],
      errors: [],
    };
  }

  return {
    fields: null,
    confidence: "qr",
    warnings: [],
    errors: ["二维码内容不是标准发票码（可能是查验链接），请手工录入或上传 OFD / XML。"],
  };
}

/* ------------------------------------------------------------------ */
/* 组装发票                                                            */
/* ------------------------------------------------------------------ */

export function guessDirection(fields: DocFields, companyName?: string): Direction {
  const name = (companyName ?? "").trim();
  if (name) {
    if (fields.seller && fields.seller.includes(name)) return "output";
    if (fields.buyer && fields.buyer.includes(name)) return "input";
  }
  return "input";
}

export function buildInvoice(
  fields: DocFields,
  companyName?: string,
): { invoice: Invoice; warnings: string[] } {
  const warnings: string[] = [];
  const direction = guessDirection(fields, companyName);
  if (!companyName?.trim()) {
    warnings.push("未填写本单位名称，已默认按进项处理，请核对。");
  }

  const counterparty = direction === "input" ? fields.seller : fields.buyer;
  if (!counterparty) warnings.push("未识别到对方单位名称。");

  const kind: InvoiceKind = fields.kind ?? (direction === "input" ? "ordinary" : "special");
  let rate = fields.rate;
  if (rate === undefined && fields.amount && fields.tax !== undefined && fields.amount > 0) {
    rate = Math.round((fields.tax / fields.amount) * 10000) / 100;
  }
  if (rate === undefined) {
    rate = 0;
    warnings.push("未能识别税率，已按 0% 暂存，请在明细中修正。");
  }

  const invoice = completeInvoice({
    direction,
    kind,
    date: fields.date ?? "",
    number: fields.number ?? "",
    counterparty: counterparty ?? "",
    category: fields.itemName?.slice(0, 24) || "未分类",
    amount: fields.amount ?? undefined,
    tax: fields.tax ?? undefined,
    total: fields.total ?? undefined,
    rate,
    checked: direction === "input" && kind === "special",
  });

  if (!fields.date) warnings.push("未识别到开票日期，已使用今天。");

  return { invoice, warnings };
}

/* ------------------------------------------------------------------ */
/* 分派                                                                */
/* ------------------------------------------------------------------ */

export const DOC_EXT = /\.(pdf|ofd|xml|jpg|jpeg|png|webp|bmp)$/i;

export async function parseDoc(file: File): Promise<DocOutcome> {
  const name = file.name.toLowerCase();
  try {
    if (name.endsWith(".xml")) {
      const text = await file.text();
      const fields = parseInvoiceXml(text);
      if (!fields) {
        return {
          fields: null,
          confidence: "structured",
          warnings: [],
          errors: ["XML 里没有找到发票要素，请确认是发票原件而不是申报数据。"],
        };
      }
      return { fields, confidence: "structured", warnings: [], errors: [] };
    }
    if (name.endsWith(".ofd")) return await parseOfd(file);
    if (name.endsWith(".pdf")) return await parsePdf(file);
    if (DOC_EXT.test(name)) return await parseImage(file);
    return { fields: null, confidence: "text", warnings: [], errors: ["不支持的文件类型。"] };
  } catch (err) {
    return {
      fields: null,
      confidence: "text",
      warnings: [],
      errors: [`解析失败：${(err as Error).message || "文件可能损坏"}`],
    };
  }
}
