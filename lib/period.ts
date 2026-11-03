import type { Invoice } from "./types";

export type PeriodKind = "month" | "quarter" | "year";

export const periodKindOf = (period: string): PeriodKind =>
  period.includes("-Q") ? "quarter" : period.length === 4 ? "year" : "month";

/** "2026-10" | "2026-Q4" | "2026" | ""（全部） */
export function inPeriod(date: string, period: string): boolean {
  if (!period) return true;
  if (period.includes("-Q")) {
    const year = period.slice(0, 4);
    const q = Number(period.slice(-1));
    const month = Number(date.slice(5, 7));
    return date.startsWith(year) && month >= (q - 1) * 3 + 1 && month <= q * 3;
  }
  return date.startsWith(period);
}

export function periodLabel(period: string): string {
  if (!period) return "全部期间";
  if (period.includes("-Q")) {
    return `${period.slice(0, 4)} 年第 ${period.slice(-1)} 季度`;
  }
  if (period.length === 4) return `${period} 年`;
  return `${period.slice(0, 4)} 年 ${Number(period.slice(5, 7))} 月`;
}

/** 期间内的月份列表（升序） */
export function monthsOfPeriod(period: string): string[] {
  if (!period) return [];
  if (period.includes("-Q")) {
    const year = period.slice(0, 4);
    const q = Number(period.slice(-1));
    return [1, 2, 3].map((i) => `${year}-${String((q - 1) * 3 + i).padStart(2, "0")}`);
  }
  if (period.length === 4) {
    return Array.from({ length: 12 }, (_, i) => `${period}-${String(i + 1).padStart(2, "0")}`);
  }
  return [period];
}

/** 把某个「期间」与「报表所属期间」对齐：报表可以是月，期间可以是月/季/年 */
export function periodContains(outer: string, inner: string): boolean {
  if (!outer) return true;
  if (outer.includes("-Q") || outer.length === 4) {
    return monthsOfPeriod(outer).some((m) => m === inner || inner.startsWith(m));
  }
  return inner.startsWith(outer) || (inner.length === 4 && outer.startsWith(inner));
}

/** 出现过的月份，倒序（最新在前），与期间下拉的展示顺序一致 */
export function listMonths(invoices: Invoice[]): string[] {
  const set = new Set<string>();
  for (const i of invoices) if (i.date) set.add(i.date.slice(0, 7));
  return [...set].sort((a, b) => b.localeCompare(a));
}

/**
 * 期间下拉选项。extraMonths 用于把「只有财务报表、没有发票」的月份也列出来。
 */
export function periodOptions(invoices: Invoice[], extraMonths: string[] = []) {
  const months = [
    ...new Set([
      ...listMonths(invoices),
      ...extraMonths.filter((m) => /^\d{4}-\d{2}$/.test(m)),
    ]),
  ].sort((a, b) => b.localeCompare(a));
  const quarters = [...new Set(months.map((m) => `${m.slice(0, 4)}-Q${Math.ceil(Number(m.slice(5, 7)) / 3)}`))];
  const years = [
    ...new Set([...months.map((m) => m.slice(0, 4)), ...extraMonths.filter((m) => /^\d{4}$/.test(m))]),
  ];
  const desc = (a: string, b: string) => b.localeCompare(a);
  return { month: months, quarter: quarters.sort(desc), year: years.sort(desc) };
}
