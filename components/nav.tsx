"use client";

import { useEffect, useState } from "react";

export type ModuleKey = "invoice" | "statement" | "tax";

const TABS: { id: ModuleKey; label: string }[] = [
  { id: "invoice", label: "发票" },
  { id: "statement", label: "财务报表" },
  { id: "tax", label: "税金测算" },
];

export function Nav({
  module,
  onChange,
  counts,
}: {
  module: ModuleKey;
  onChange: (m: ModuleKey) => void;
  /** 各模块的数据量，用于在标签上做提示 */
  counts?: Partial<Record<ModuleKey, number>>;
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`nav ${scrolled ? "is-scrolled" : ""}`}>
      <div className="nav__inner">
        <a className="nav__brand" href="#top" style={{ color: "var(--ink)" }}>
          票税 <span>Invoice &amp; Tax</span>
        </a>
        <nav className="nav__links">
          <div className="seg seg--nav">
            {TABS.map((t) => {
              const n = counts?.[t.id];
              return (
                <button
                  key={t.id}
                  className={`seg__item ${module === t.id ? "is-active" : ""}`}
                  onClick={() => onChange(t.id)}
                >
                  {t.label}
                  {n ? <span className="seg__badge">{n}</span> : null}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </header>
  );
}
