export const fmtMoney = (n: number, digits = 2) =>
  `¥${(isFinite(n) ? n : 0).toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;

export const fmtNumber = (n: number, digits = 2) =>
  (isFinite(n) ? n : 0).toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

/** 万元简写，用于图表轴 */
export const fmtWan = (n: number) => {
  const v = n / 10000;
  if (Math.abs(v) >= 1000) return `${(v / 10000).toFixed(1)} 亿`;
  return `${v.toFixed(v >= 100 || Number.isInteger(v) ? 0 : 1)} 万`;
};

export const fmtPercent = (n: number, digits = 2) => `${(isFinite(n) ? n : 0).toFixed(digits)}%`;

export const monthOf = (date: string) => (date || "").slice(0, 7);

export const monthLabel = (month: string) => {
  if (!month || month.length < 7) return month || "—";
  return `${Number(month.slice(5, 7))} 月`;
};

export const fmtDate = (date: string) => (date || "").replaceAll("-", ".");

export const directionLabel = (d: string) => (d === "input" ? "进项" : "销项");
export const kindLabel = (k: string) => (k === "special" ? "专票" : "普票");

/**
 * 解析单元格里的金额。财务报表常见写法：
 * "1,234,567.89" / "¥1,234.56" / "(1,234.56)"（负数）/ "—"（空）
 */
export const parseAmount = (v: unknown): number | undefined => {
  const s = String(v ?? "").trim();
  if (!s) return undefined;
  if (/^[-—–－/／]+$/.test(s)) return undefined;
  const negative = /^[（(].*[)）]$/.test(s) || s.startsWith("-") || s.startsWith("－");
  const cleaned = s.replace(/[（()）,，\s¥￥元]/g, "").replace(/[－—]/g, "-");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return undefined;
  const n = Number(cleaned);
  if (!isFinite(n)) return undefined;
  return negative ? -Math.abs(n) : n;
};
