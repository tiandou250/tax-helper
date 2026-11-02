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
