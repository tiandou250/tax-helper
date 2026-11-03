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
  /** 票面全部项目名（多行明细时用于提示） */
  itemNames?: string[];
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
  itemNames: [],
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
  // 版式 PDF 经常把公司名拆成 "宜昌律信 投资有限公司"，去掉内部空白
  return out.replace(/[\s：:]+/g, "").trim();
};

/**
 * 把同一页的文字块还原成行：
 * 1) 先按 y 聚行（容差 tol，PDF 同行的基线常有 1~3pt 抖动）
 * 2) 行内再按 x 排序，否则「（小写）」会跑到金额后面
 * 3) 相邻块间距大于 gap 时补空格，避免表格单元格粘连成 "832408.575%"
 */
function buildLines(
  rows: { s: string; x: number; y: number; w: number }[],
  tol: number,
  gap: number,
): string {
  const sorted = [...rows].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; items: typeof sorted }[] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (!last || Math.abs(last.y - it.y) > tol) lines.push({ y: it.y, items: [it] });
    else last.items.push(it);
  }
  return lines
    .map((l) => {
      l.items.sort((a, b) => a.x - b.x);
      let out = "";
      let prevEnd = -Infinity;
      for (const it of l.items) {
        if (prevEnd > -Infinity && it.x - prevEnd > gap) out += " ";
        out += it.s;
        prevEnd = it.x + it.w;
      }
      return out;
    })
    .join("\n");
}

export function extractFromText(raw: string): DocFields | null {
  const text = raw
    .replace(/\u00a0/g, " ")
    .replace(/[\u3000]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
  const flat = text.replace(/\s+/g, "");
  if (flat.length < 12) return null;

  /* 发票号码：标签 → No. → 独立的 20 位 / 8 位数字 */
  const number =
    flat.match(/发票号码[：:]?([0-9]{8,25})/)?.[1] ??
    flat.match(/发票号[：:]?([0-9]{8,25})/)?.[1] ??
    flat.match(/(?:No|NO|№)[.：:]?([0-9]{8,25})/)?.[1] ??
    flat.match(/(?<!\d)(\d{20})(?!\d)/)?.[1] ??
    flat.match(/(?<!\d)(\d{8})(?!\d)/)?.[1];

  /* 开票日期：标签 → 中文日期 → 破折号日期 */
  const pad = (s: string) => s.padStart(2, "0");
  const dm =
    flat.match(/开票日期[：:]?(\d{4})[年\-/.](\d{1,2})[月\-/.](\d{1,2})/) ??
    flat.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/) ??
    flat.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  const date = dm ? `${dm[1]}-${pad(dm[2])}-${pad(dm[3])}` : undefined;

  /* 价税合计：小写 → 价税合计后第一个金额 */
  const total =
    num(flat.match(/[（(]小写[)）][：:]?[¥￥]?([\d,]+\.?\d{0,2})/)?.[1]) ??
    num(flat.match(/价税合计[^0-9]{0,18}?([\d,]+\.\d{2})/)?.[1]) ??
    num(flat.match(/价税合计金额[：:]?[¥￥]?([\d,]+\.\d{2})/)?.[1]);

  /* 合计行：金额 + 税额 */
  let amount: number | undefined;
  let tax: number | undefined;
  const sum =
    flat.match(/合\s*计[¥￥]?([\d,]+\.\d{2})[¥￥]?([\d,]+\.\d{2})/) ??
    flat.match(/合\s*计[¥￥]?([\d,]+\.\d{2})/);
  if (sum) {
    amount = num(sum[1]);
    if (sum[2]) tax = num(sum[2]);
  }

  const rate =
    normRate(text.match(/(?:^|\s)(\d{1,2})\s*%/)?.[1]) ??
    [...flat.matchAll(/(\d{1,2})%/g)]
      .map((m) => Number(m[1]))
      .find((r) => [0, 1, 3, 5, 6, 9, 13, 17].includes(r));

  /* 名称：先在整行里找，再在去空白的整篇里找 */
  const namePattern = (label: string) =>
    new RegExp(`${label}[^\\n]{0,20}?名称[：:]\\s*([^\\n]+)`);
  const flatName = (label: string) =>
    new RegExp(`${label}[^名\\n]{0,12}名称[：:]?([\\u4e00-\\u9fa5A-Za-z0-9（）()·]{2,40})`);

  const buyerRaw =
    text.match(namePattern("购买方"))?.[1] ??
    text.match(namePattern("购方"))?.[1] ??
    flat.match(flatName("购买方"))?.[1];
  const sellerRaw =
    text.match(namePattern("销售方"))?.[1] ??
    text.match(namePattern("销方"))?.[1] ??
    flat.match(flatName("销售方"))?.[1];

  // 版式票常见「购买方 名称：X  销售方 名称：Y」并列，且中间可能夹不可见字符，
  // 所以不用前瞻，直接按「名称：」切段，再按公司类后缀截取
  const NAME_RE =
    /[\u4e00-\u9fa5A-Za-z0-9（）()·\s]{2,40}?(?:公司|集团|中心|厂|店|事务所|合作社|研究院|银行|医院|学校|政府|委员会)/;

  const pickName = (chunk: string) => {
    const line = chunk.split("\n")[0];
    const m = line.match(NAME_RE);
    if (m) return m[0].replace(/[\s：:]/g, "");
    return cleanName(line);
  };

  const allNames = text
    .split(/名称[：:]/)
    .slice(1)
    .map(pickName)
    .filter((s) => s.length >= 2);

  const buyer = buyerRaw ? cleanName(buyerRaw) : allNames[0];
  const seller = sellerRaw ? cleanName(sellerRaw) : allNames[1];

  /* 项目：优先税收分类编码写法 *类别*具体名称 */
  const itemNames: string[] = [];
  for (const m of text.matchAll(/\*([^*\n]{1,20})\*([^\s*]{1,30})/g)) {
    const name = m[2].trim();
    if (name && !itemNames.includes(name)) itemNames.push(name);
  }
  if (itemNames.length === 0) {
    const itemRaw = text.match(/项目名称[：:]?\s*([^\n]+)/)?.[1];
    if (itemRaw) {
      const cleaned = cleanName(itemRaw).slice(0, 20);
      if (cleaned) itemNames.push(cleaned);
    }
  }

  if (!number && total === undefined && !date) return null;

  return {
    number,
    date,
    buyer,
    seller,
    total,
    amount,
    tax,
    rate,
    itemName: itemNames[0],
    itemNames,
    kind: /专用发票/.test(flat) ? "special" : /普通发票/.test(flat) ? "ordinary" : undefined,
    rawText: text.slice(0, 6000),
  };
}

/** 从 PDF 首页渲染图里解发票二维码（版式 PDF / 无文字层时的兜底） */
async function qrFromPdfPage(pdf: any): Promise<DocFields | null> {
  try {
    const { default: jsQR } = await import("jsqr");
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    await page.render({ canvasContext: ctx, viewport, canvas } as never).promise;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const qr = jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" });
    if (!qr) return null;
    const parts = qr.data.split(",");
    if (parts.length >= 6 && /^\d{1,2}$/.test(parts[0])) {
      return {
        code: parts[2] || undefined,
        number: parts[3] || undefined,
        total: num(parts[4]),
        date: normDate(parts[5]),
        rawText: qr.data,
      };
    }
    return null;
  } catch (err) {
    console.warn("[doc-parse] PDF 二维码兜底失败:", (err as Error)?.message ?? err);
    return null;
  }
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

  // OFD 坐标原点在左上、Y 向下：buildLines 按 y 降序不适用，先翻转再还原
  const text = buildLines(
    chunks.map((c) => ({ s: c.s, x: c.x, y: -c.y, w: 0 })),
    2,
    6,
  );
  const fields = extractFromText(text);
  if (!fields) {
    return {
      fields: null,
      confidence: "text",
      warnings: [],
      errors: [
        text.replace(/\s+/g, "").length < 20
          ? "这份 OFD 没有可读文字层，请改用该发票的 XML 原件，或手工录入。"
          : `OFD 文字层读到 ${text.length} 个字符，但没匹配到发票号码 / 价税合计，可能是特殊版式。请改用 XML 原件或手工录入。`,
      ],
      text,
    };
  }
  return {
    fields,
    confidence: "text",
    warnings: ["依据 OFD 文字层识别，税率与对方信息请核对。"],
    errors: [],
    text,
  };
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
        const item = it as { str?: string; transform?: number[]; width?: number };
        if (!item.str || !item.transform) return null;
        return {
          s: item.str,
          x: item.transform[4],
          y: item.transform[5],
          w: item.width ?? 0,
        };
      })
      .filter((v): v is { s: string; x: number; y: number; w: number } => Boolean(v?.s.trim()));

    items.sort((a, b) => b.y - a.y || a.x - b.x);
    pages.push(buildLines(items, 3, 1.5));
  }
  const text = pages.join("\n");
  const flatLen = text.replace(/\s+/g, "").length;
  let fields = extractFromText(text);
  const warnings: string[] = [];
  let confidence: Confidence = "text";

  if (!fields) {
    // 文字层不可用（版式转曲 / 扫描件 / 字体缺 ToUnicode）→ 兜底读二维码
    const qr = await qrFromPdfPage(doc);
    if (qr) {
      fields = qr;
      confidence = "qr";
      warnings.push(
        flatLen < 20
          ? "这份 PDF 没有文字层（版式转曲或扫描件），已通过票面二维码取得票号、日期与价税合计。"
          : "文字层里没匹配到票面要素，已改用票面二维码。",
      );
    } else {
      await doc.destroy();
      return {
        fields: null,
        confidence: "text",
        warnings: [],
        errors: [
          flatLen < 20
            ? "这份 PDF 没有可提取的文字层，也没读到发票二维码。请改用该发票的 OFD / XML 原件，或手工录入。"
            : `PDF 读到 ${flatLen} 个字符，但没匹配到发票号码 / 价税合计，可能是特殊版式；也没读到二维码。可用「手工录入」补 4 个字段。`,
        ],
        text: text.slice(0, 2000),
      };
    }
  }

  await doc.destroy();

  if (confidence === "text") {
    const missing = [
      !fields.number && "发票号码",
      !fields.date && "开票日期",
      fields.total === undefined && "价税合计",
      !fields.buyer && !fields.seller && "对方单位",
    ].filter(Boolean) as string[];
    warnings.push(
      missing.length
        ? `依据 PDF 文字层识别，未读到：${missing.join("、")}，请在明细中补录。`
        : "依据 PDF 文字层识别，请核对税率与对方信息。",
    );
  }

  return { fields, confidence, warnings, errors: [], text };
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

  const itemCount = fields.itemNames?.length ?? 0;
  if (itemCount > 1) {
    warnings.push(
      `票面含 ${itemCount} 个项目（${fields.itemNames!.slice(0, 3).join("、")}${itemCount > 3 ? " 等" : ""}），已按第一个归集，可在明细里改成需要的项目名。`,
    );
  }

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
