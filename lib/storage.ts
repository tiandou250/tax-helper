/**
 * 会话级存储。
 *
 * 财务数据属于敏感信息，本应用**不做持久化**：
 * - 一律写入 sessionStorage，浏览器在标签页 / 窗口关闭时自动清除；
 * - 刷新页面数据仍在（避免误按 F5 丢掉当天导入的发票）；
 * - 旧版本（v2）把数据写在 localStorage 里，首次打开时迁移进本次会话并立刻从磁盘删除。
 *
 * 需要跨会话保留时，请使用页面上的「导出」能力另存文件，而不是依赖浏览器。
 */

export const SS = {
  invoices: "piaoshui.ss.invoices",
  statements: "piaoshui.ss.statements",
  settings: "piaoshui.ss.settings",
  period: "piaoshui.ss.period",
  dimension: "piaoshui.ss.dim",
} as const;

/** 旧版本写在 localStorage 的键，首次打开会被清除 */
const LEGACY_PREFIX = "piaoshui.";

/** 旧版本（localStorage 时代）的键名，仅用于迁移读取 */
export const LEGACY = {
  invoices: "piaoshui.invoices.v2",
  statements: "piaoshui.statements.v2",
  settings: "piaoshui.settings.v2",
  period: "piaoshui.period.v2",
  dimension: "piaoshui.dim.v2",
} as const;

function session(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readSS<T>(key: string, fallback: T): T {
  const s = session();
  if (!s) return fallback;
  try {
    const raw = s.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function readSSString(key: string): string {
  const s = session();
  if (!s) return "";
  try {
    return s.getItem(key) ?? "";
  } catch {
    return "";
  }
}

export function writeSS(key: string, value: unknown): void {
  const s = session();
  if (!s) return;
  try {
    s.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  } catch {
    /* 配额或隐私模式异常时静默降级为纯内存 */
  }
}

export function removeSS(key: string): void {
  try {
    session()?.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * 读取一个字段：优先会话内的值；没有则把旧版本留在 localStorage 的数据搬过来。
 * 迁移只做一次，之后旧键由调用方通过 purgeLegacy() 从磁盘删除。
 */
export function migrateLegacy<T>(
  sessionKey: string,
  legacyKey: string,
  fallback: T,
): { value: T; migrated: boolean } {
  const s = session();

  // 1. 会话里已有 → 直接用（刷新场景）
  if (s) {
    try {
      const raw = s.getItem(sessionKey);
      if (raw !== null) return { value: JSON.parse(raw) as T, migrated: false };
    } catch {
      /* 会话数据损坏则继续往下走 */
    }
  }

  // 2. 会话里没有 → 尝试从旧版本写在磁盘上的数据迁移
  let value = fallback;
  let migrated = false;
  try {
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem(legacyKey);
      if (raw) {
        value = JSON.parse(raw) as T;
        migrated = true;
      }
    }
  } catch {
    /* 旧数据损坏则忽略 */
  }

  if (migrated) writeSS(sessionKey, value);
  return { value, migrated };
}

/** 清空本应用在 localStorage 里留下的一切（旧版本痕迹） */
export function purgeLegacy(): string[] {
  const removed: string[] = [];
  try {
    if (typeof window === "undefined") return removed;
    const ls = window.localStorage;
    for (let i = ls.length - 1; i >= 0; i--) {
      const k = ls.key(i);
      if (k && k.startsWith(LEGACY_PREFIX)) {
        ls.removeItem(k);
        removed.push(k);
      }
    }
  } catch {
    /* ignore */
  }
  return removed;
}

/** 清空会话内的业务数据（不含参数，用于「清空发票与报表」） */
export function clearBusinessKeys(): void {
  [SS.invoices, SS.statements, SS.period].forEach(removeSS);
}

/** 全部重置：连计算参数一起清掉 */
export function clearAllKeys(): void {
  Object.values(SS).forEach(removeSS);
  purgeLegacy();
}
