"use client";

import { useEffect, useState } from "react";
import type { MonthBucket, RateBucket } from "@/lib/tax";
import { fmtMoney, fmtNumber, fmtPercent } from "@/lib/format";

function useInView() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return on;
}

/** 月度进销项对比：柱状，入场自下而上生长 620ms + 每列 70ms 级联 */
export function MonthlyBars({ data }: { data: MonthBucket[] }) {
  const on = useInView();
  if (data.length === 0) return <div className="empty">暂无数据</div>;

  const max = Math.max(
    1,
    ...data.map((d) => Math.max(d.outputAmount, d.inputAmount)),
  );

  return (
    <div>
      <div className={`bars ${on ? "is-in" : ""}`}>
        {data.map((d, i) => (
          <div className="bars__group" key={d.month}>
            <div
              className="bars__bar"
              style={{
                height: `${Math.max(1, (d.outputAmount / max) * 100)}%`,
                transitionDelay: `${i * 70}ms`,
              }}
              title={`销项 ${fmtMoney(d.outputAmount)}`}
            />
            <div
              className="bars__bar bars__bar--soft"
              style={{
                height: `${Math.max(1, (d.inputAmount / max) * 100)}%`,
                transitionDelay: `${i * 70 + 40}ms`,
              }}
              title={`进项 ${fmtMoney(d.inputAmount)}`}
            />
          </div>
        ))}
      </div>
      <div className="bars-axis">
        {data.map((d) => (
          <div className="bars__label" style={{ flex: 1 }} key={d.month}>
            {Number(d.month.slice(5, 7))} 月
          </div>
        ))}
      </div>
    </div>
  );
}

/** 税率结构：专票 / 普票 两段堆叠 */
export function RateStack({ data }: { data: RateBucket[] }) {
  const on = useInView();
  if (data.length === 0) return <div className="empty">暂无数据</div>;
  const max = Math.max(1, ...data.map((d) => d.amount));

  return (
    <div className={`stack ${on ? "is-in" : ""}`}>
      {data.map((d) => (
        <div className="stack__row" key={d.rate}>
          <div className="body num">{d.rate}%</div>
          <div className="stack__track">
            <div
              className="stack__fill"
              style={{ width: `${(d.specialAmount / max) * 100}%` }}
              title={`专票 ${fmtMoney(d.specialAmount)}`}
            />
            <div
              className="stack__fill stack__fill--soft"
              style={{ width: `${(d.ordinaryAmount / max) * 100}%` }}
              title={`普票 ${fmtMoney(d.ordinaryAmount)}`}
            />
          </div>
          <div className="stack__value">{fmtNumber(d.amount, 0)}</div>
        </div>
      ))}
    </div>
  );
}

/** 单条进度型占比列表 */
export function MeterList({
  items,
  total,
  onPick,
}: {
  items: { name: string; value: number; meta?: string }[];
  total: number;
  /** 点击某一行时回调（用于跳到明细并筛该项目） */
  onPick?: (name: string) => void;
}) {
  const on = useInView();
  if (items.length === 0) return <div className="empty">暂无数据</div>;
  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {items.map((item, idx) => (
        <div
          key={item.name}
          style={{ padding: "14px 0", cursor: onPick ? "pointer" : undefined }}
          onClick={() => onPick?.(item.name)}
          className={onPick ? "meter-row" : undefined}
          title={onPick ? "点击在发票明细中筛选该项目" : undefined}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              alignItems: "baseline",
            }}
          >
            <span
              className="body ellipsis"
              style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {item.name}
            </span>
            <span className="body num" style={{ whiteSpace: "nowrap" }}>
              {fmtNumber(item.value, 0)}
              <span className="micro" style={{ marginLeft: 8 }}>
                {total > 0 ? fmtPercent((item.value / total) * 100, 1) : "0%"}
              </span>
            </span>
          </div>
          <div className="meter">
            <div
              className="meter__fill"
              style={{
                width: on ? `${(item.value / max) * 100}%` : 0,
                transitionDelay: `${idx * 60}ms`,
              }}
            />
          </div>
          {item.meta ? (
            <div className="micro" style={{ marginTop: 8 }}>
              {item.meta}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** 税种构成：横向条形 + 税额 */
export function TaxBars({
  lines,
}: {
  lines: { key: string; name: string; amount: number; rateLabel: string }[];
}) {
  const on = useInView();
  const max = Math.max(1, ...lines.map((l) => l.amount));

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {lines.map((l, idx) => (
        <div key={l.key} style={{ padding: "13px 0" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              alignItems: "baseline",
            }}
          >
            <span className="body">{l.name}</span>
            <span className="body num">{fmtNumber(l.amount)}</span>
          </div>
          <div className="meter">
            <div
              className="meter__fill"
              style={{
                width: on ? `${Math.max(1.2, (l.amount / max) * 100)}%` : 0,
                transitionDelay: `${idx * 60}ms`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
