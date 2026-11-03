"use client";

import { useEffect, useState } from "react";

const LINKS = [
  { id: "overview", label: "总览" },
  { id: "invoices", label: "发票明细" },
  { id: "summary", label: "分类汇总" },
  { id: "statements", label: "财务报表" },
  { id: "tax", label: "税金测算" },
  { id: "params", label: "计算参数" },
];

export function Nav({ hasData = true }: { hasData?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState("overview");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!hasData) return;
    const sections = LINKS.map((l) => document.getElementById(l.id)).filter(
      (el): el is HTMLElement => Boolean(el),
    );
    if (!sections.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: [0.01, 0.2, 0.5] },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [hasData]);

  return (
    <header className={`nav ${scrolled ? "is-scrolled" : ""}`}>
      <div className="nav__inner">
        <a className="nav__brand" href="#top" style={{ color: "var(--ink)" }}>
          票税 <span>Invoice &amp; Tax</span>
        </a>
        <nav className="nav__links">
          {hasData &&
            LINKS.map((l) => (
              <a
                key={l.id}
                href={`#${l.id}`}
                className={`nav__link ${active === l.id ? "is-active" : ""}`}
              >
                {l.label}
              </a>
            ))}
        </nav>
      </div>
    </header>
  );
}
