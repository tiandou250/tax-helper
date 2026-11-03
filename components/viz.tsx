"use client";

import { useEffect, useId, useRef, useState } from "react";
import { fmtNumber, fmtWan } from "@/lib/format";

/* ==========================================================================
   图表基础
   --------------------------------------------------------------------------
   配色遵循站点规范：主色 #0071E3 只用于按钮、链接与「当前选中」这类交互态，
   因此图表主体一律走中性灰阶，靠深浅与图例区分序列，避免出现第二强调色。
   ========================================================================== */

const C = {
  ink: "#1d1d1f",
  ink2: "#6e6e73",
  ink3: "#a1a1a6",
  line: "#d2d2d7",
  soft: "#ebebef",
  accent: "#0071e3",
};

/** 灰阶序列，索引越大越浅 */
export const GREY = ["#1d1d1f", "#5a5a5e", "#8e8e93", "#aeaeb2", "#c7c7cc", "#d8d8dc", "#e5e5ea"];
export const grey = (i: number) => GREY[Math.min(i, GREY.length - 1)];

const EASE = "cubic-bezier(.16, 1, .3, 1)";

/** 量测容器宽度，按 1:1 像素绘制，保证字号不被缩放 */
function useMeasure<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(Math.round(el.getBoundingClientRect().width));
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      setWidth((prev) => (Math.abs(prev - w) > 1 ? w : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width] as const;
}

/** 入场开关：挂载后下一帧打开，触发过渡 */
function useEnter(delay = 0) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setOn(true), 60 + delay);
    return () => window.clearTimeout(id);
  }, [delay]);
  return on;
}

/** 取刻度上限：把最大值向上取到一个好读的档位 */
function niceCeil(v: number) {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * mag;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** 把长标签按每行 n 个字切开 */
const chunk = (s: string, n: number) => {
  if (n <= 0) return [s];
  const out: string[] = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out;
};

/**
 * 横轴标签自适应：柱位宽度 step 放不下一行时改为折行，并回传需要的底部留白。
 * 这样窄屏（约 390px）下 6～8 个柱子的标签也不会挤成一团。
 */
function fitLabels(labels: string[], step: number, basePadB: number, lineH = 13) {
  const perLine = step < 62 ? Math.max(2, Math.floor((step - 2) / 12)) : 0;
  const lines = labels.map((l) => (perLine > 0 ? chunk(l, perLine) : [l]));
  const maxLines = Math.max(1, ...lines.map((l) => l.length));
  const fontSize = step < 46 ? 10 : 11;
  return { lines, maxLines, fontSize, lineH, padB: basePadB + (maxLines - 1) * lineH };
}

/** 图例 */
export function Legend({
  items,
  onClick,
}: {
  items: { name: string; color: string; dashed?: boolean }[];
  onClick?: (name: string) => void;
}) {
  return (
    <div className="viz-legend">
      {items.map((it) => (
        <span
          className={`viz-legend__item ${onClick ? "is-clickable" : ""}`}
          key={it.name}
          onClick={() => onClick?.(it.name)}
        >
          <i
            className="viz-legend__dot"
            style={{
              background: it.dashed
                ? `repeating-linear-gradient(90deg, ${it.color} 0 4px, transparent 4px 7px)`
                : it.color,
            }}
          />
          {it.name}
        </span>
      ))}
    </div>
  );
}

/* ==========================================================================
   折线图（多序列 + 面积 + hover 十字线）
   ========================================================================== */

export interface LineSeries {
  name: string;
  values: number[];
  /** 填充面积 */
  area?: boolean;
  dashed?: boolean;
  color?: string;
}

export function LineChart({
  labels,
  series,
  height = 224,
  valueFormat = (n: number) => fmtNumber(n, 0),
  axisFormat = fmtWan,
  unit = "元",
  /** 属于当前期间的横轴下标，用主色点出 */
  activeIndexes = [],
}: {
  labels: string[];
  series: LineSeries[];
  height?: number;
  valueFormat?: (n: number) => string;
  axisFormat?: (n: number) => string;
  unit?: string;
  activeIndexes?: number[];
}) {
  const [ref, w] = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const on = useEnter();
  const uid = useId().replace(/[:]/g, "");

  const n = labels.length;
  if (n === 0) return <div className="empty">暂无数据</div>;

  const padL = 58;
  const padR = 16;
  const padT = 18;
  const padB = 30;
  const iw = Math.max(20, w - padL - padR);
  const ih = Math.max(40, height - padT - padB);

  const all = series.flatMap((s) => s.values);
  const rawMax = Math.max(0, ...all);
  const rawMin = Math.min(0, ...all);
  const top = niceCeil(rawMax || 1);
  const bottom = rawMin < 0 ? -niceCeil(-rawMin) : 0;
  const span = top - bottom || 1;

  const x = (i: number) => padL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => padT + ih - ((v - bottom) / span) * ih;

  const ticks = Array.from({ length: 5 }, (_, i) => bottom + (span * i) / 4);
  const labelStep = n > 12 ? Math.ceil(n / 8) : n > 8 ? 2 : 1;

  const path = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const areaPath = (vals: number[]) =>
    `${path(vals)} L${x(vals.length - 1).toFixed(1)} ${y(bottom).toFixed(1)} L${x(0).toFixed(1)} ${y(bottom).toFixed(1)} Z`;

  return (
    <div className="viz" ref={ref}>
      {w > 0 && (
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${w} ${height}`}
          role="img"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            const px = e.clientX - box.left;
            const i = n <= 1 ? 0 : clamp(Math.round(((px - padL) / iw) * (n - 1)), 0, n - 1);
            setHover(i);
          }}
        >
          <defs>
            {series.map((s, si) =>
              s.area ? (
                <linearGradient id={`${uid}-g${si}`} key={s.name} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color ?? grey(si)} stopOpacity="0.10" />
                  <stop offset="100%" stopColor={s.color ?? grey(si)} stopOpacity="0" />
                </linearGradient>
              ) : null,
            )}
          </defs>

          {/* 网格与纵轴刻度 */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={padL}
                x2={padL + iw}
                y1={y(t)}
                y2={y(t)}
                stroke={i === 0 ? C.line : C.soft}
                strokeWidth="1"
                style={{ opacity: on ? 1 : 0, transition: `opacity .5s ${EASE} ${i * 40}ms` }}
              />
              <text
                x={padL - 10}
                y={y(t) + 4}
                textAnchor="end"
                fontSize="11"
                fill={C.ink3}
                style={{ opacity: on ? 1 : 0, transition: `opacity .5s ${EASE} ${i * 40}ms` }}
              >
                {axisFormat(t)}
              </text>
            </g>
          ))}

          {/* 当前期间标记 */}
          {activeIndexes.map((i) => (
            <rect
              key={i}
              x={x(i) - (n <= 1 ? 18 : iw / (n - 1) / 2)}
              y={padT}
              width={n <= 1 ? 36 : iw / (n - 1)}
              height={ih}
              fill={C.accent}
              style={{
                opacity: on ? 0.05 : 0,
                transition: `opacity .6s ${EASE} .2s`,
              }}
            />
          ))}

          {/* 面积 */}
          {series.map((s, si) =>
            s.area ? (
              <path
                key={`a-${s.name}`}
                d={areaPath(s.values)}
                fill={`url(#${uid}-g${si})`}
                style={{ opacity: on ? 1 : 0, transition: `opacity .8s ${EASE} .25s` }}
              />
            ) : null,
          )}

          {/* 折线 */}
          {series.map((s, si) => (
            <path
              key={`l-${s.name}`}
              d={path(s.values)}
              fill="none"
              stroke={s.color ?? grey(si)}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={s.dashed ? "5 4" : 1}
              pathLength={s.dashed ? undefined : 1}
              strokeDashoffset={s.dashed ? undefined : on ? 0 : 1}
              style={
                s.dashed ? { opacity: on ? 0.85 : 0 } : { transition: `stroke-dashoffset 1s ${EASE} ${si * 120}ms` }
              }
            />
          ))}

          {/* 数据点：仅当前期间与 hover */}
          {series.map((s, si) =>
            s.values.map((v, i) =>
              activeIndexes.includes(i) ? (
                <circle
                  key={`d-${s.name}-${i}`}
                  cx={x(i)}
                  cy={y(v)}
                  r="3.5"
                  fill="#fff"
                  stroke={s.color ?? grey(si)}
                  strokeWidth="2"
                  style={{ opacity: on ? 1 : 0, transition: `opacity .5s ${EASE} ${400 + si * 60}ms` }}
                />
              ) : null,
            ),
          )}

          {/* hover 十字线 */}
          {hover !== null && (
            <g>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={padT}
                y2={padT + ih}
                stroke={C.ink3}
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              {series.map((s, si) => (
                <circle
                  key={`h-${s.name}`}
                  cx={x(hover)}
                  cy={y(s.values[hover] ?? 0)}
                  r="4"
                  fill="#fff"
                  stroke={s.color ?? grey(si)}
                  strokeWidth="2.5"
                />
              ))}
            </g>
          )}

          {/* 横轴标签 */}
          {labels.map((l, i) =>
            i % labelStep === 0 || i === n - 1 ? (
              <text
                key={l + i}
                x={x(i)}
                y={height - 10}
                textAnchor="middle"
                fontSize="11"
                fill={activeIndexes.includes(i) ? C.ink : C.ink3}
                style={{ opacity: on ? 1 : 0, transition: `opacity .5s ${EASE} .3s` }}
              >
                {l}
              </text>
            ) : null,
          )}
        </svg>
      )}

      {hover !== null && w > 0 && (
        <div
          className="viz-tip"
          style={{
            left: clamp(x(hover), 78, w - 78),
            transform: "translateX(-50%)",
          }}
        >
          <div className="viz-tip__head">{labels[hover]}</div>
          {series.map((s, si) => (
            <div className="viz-tip__row" key={s.name}>
              <i className="viz-tip__dot" style={{ background: s.color ?? grey(si) }} />
              <span>{s.name}</span>
              <b className="num">
                {valueFormat(s.values[hover] ?? 0)}
                {unit}
              </b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   环形图
   ========================================================================== */

export function Donut({
  items,
  size = 176,
  thickness = 24,
  centerLabel,
  centerValue,
  valueFormat = (n: number) => fmtWan(n),
  onPick,
}: {
  items: { name: string; value: number }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
  valueFormat?: (n: number) => string;
  onPick?: (name: string) => void;
}) {
  const on = useEnter();
  const [hot, setHot] = useState<string | null>(null);
  const total = items.reduce((s, i) => s + i.value, 0);

  if (items.length === 0 || total <= 0) return <div className="empty">暂无数据</div>;

  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  const gap = items.length > 1 ? 2 : 0;

  let acc = 0;
  const arcs = items.map((it, i) => {
    const frac = it.value / total;
    const len = Math.max(0, frac * circ - gap);
    const arc = { ...it, i, len, offset: acc, frac };
    acc += frac * circ;
    return arc;
  });

  return (
    <div className="donut">
      <div className="donut__ring" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.soft} strokeWidth={thickness} />
          {arcs.map((a) => {
            const dim = hot !== null && hot !== a.name;
            return (
              <circle
                key={a.name}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={grey(a.i)}
                strokeWidth={hot === a.name ? thickness + 5 : thickness}
                strokeLinecap="butt"
                strokeDasharray={on ? `${a.len} ${circ - a.len}` : `0 ${circ}`}
                strokeDashoffset={-a.offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                style={{
                  transition: `stroke-dasharray .95s ${EASE} ${a.i * 90}ms, stroke-width .2s ${EASE}, opacity .2s ${EASE}`,
                  opacity: on ? (dim ? 0.35 : 1) : 0,
                  cursor: onPick ? "pointer" : undefined,
                }}
                onMouseEnter={() => setHot(a.name)}
                onMouseLeave={() => setHot(null)}
                onClick={() => onPick?.(a.name)}
              />
            );
          })}
        </svg>
        <div className="donut__center">
          <span className="micro">{hot ?? centerLabel ?? "合计"}</span>
          <b className="num">{hot ? valueFormat(items.find((i) => i.name === hot)?.value ?? 0) : centerValue ?? valueFormat(total)}</b>
        </div>
      </div>

      <div className="donut__legend">
        {arcs.map((a) => (
          <div
            className={`donut__row ${hot === a.name ? "is-hot" : ""}`}
            key={a.name}
            onMouseEnter={() => setHot(a.name)}
            onMouseLeave={() => setHot(null)}
            onClick={() => onPick?.(a.name)}
          >
            <i className="donut__dot" style={{ background: grey(a.i) }} />
            <span className="donut__name ellipsis" title={a.name}>
              {a.name}
            </span>
            <span className="donut__val num">{valueFormat(a.value)}</span>
            <span className="donut__pct num">{(a.frac * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ==========================================================================
   柱状图（支持正负）
   ========================================================================== */

export function Columns({
  items,
  height = 208,
  valueFormat = (n: number) => fmtWan(n),
  onPick,
}: {
  items: { label: string; value: number; active?: boolean }[];
  height?: number;
  valueFormat?: (n: number) => string;
  onPick?: (label: string) => void;
}) {
  const [ref, w] = useMeasure<HTMLDivElement>();
  const on = useEnter();
  const [hover, setHover] = useState<number | null>(null);

  if (items.length === 0) return <div className="empty">暂无数据</div>;

  const padL = 58;
  const padR = 16;
  const padT = 18;
  const iw = Math.max(20, w - padL - padR);
  const step = iw / items.length;
  /* 柱位放不下一行标签时折行，底部留白随之加高 */
  const fit = fitLabels(items.map((i) => i.label), step, 30);
  const padB = fit.padB;
  const ih = Math.max(40, height - padT - padB);

  const maxPos = Math.max(0, ...items.map((i) => i.value));
  const maxNeg = Math.min(0, ...items.map((i) => i.value));
  const top = niceCeil(maxPos || 1);
  const bottom = maxNeg < 0 ? -niceCeil(-maxNeg) : 0;
  const span = top - bottom || 1;

  const bw = Math.min(46, step * 0.55);
  const y = (v: number) => padT + ih - ((v - bottom) / span) * ih;
  const zero = y(0);
  const ticks = Array.from({ length: 5 }, (_, i) => bottom + (span * i) / 4);

  return (
    <div className="viz" ref={ref}>
      {w > 0 && (
        <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} role="img">
          {ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={padL}
                x2={padL + iw}
                y1={y(t)}
                y2={y(t)}
                stroke={t === 0 ? C.line : C.soft}
                style={{ opacity: on ? 1 : 0, transition: `opacity .5s ${EASE} ${i * 40}ms` }}
              />
              <text
                x={padL - 10}
                y={y(t) + 4}
                textAnchor="end"
                fontSize="11"
                fill={C.ink3}
                style={{ opacity: on ? 1 : 0, transition: `opacity .5s ${EASE} ${i * 40}ms` }}
              >
                {valueFormat(t)}
              </text>
            </g>
          ))}

          {items.map((it, i) => {
            const cx = padL + step * (i + 0.5);
            const v = it.value;
            const h = Math.max(2, Math.abs(y(v) - zero));
            const top0 = v >= 0 ? zero - h : zero;
            const active = it.active || hover === i;
            return (
              <g
                key={it.label}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onPick?.(it.label)}
                style={{ cursor: onPick ? "pointer" : undefined }}
              >
                <rect x={padL + step * i} y={padT} width={step} height={ih} fill="transparent" />
                <rect
                  x={cx - bw / 2}
                  y={on ? top0 : zero}
                  width={bw}
                  height={on ? h : 1}
                  rx="4"
                  fill={active ? C.accent : v >= 0 ? grey(1) : grey(3)}
                  style={{
                    transition: `y .75s ${EASE} ${i * 55}ms, height .75s ${EASE} ${i * 55}ms, fill .2s ${EASE}`,
                  }}
                />
                {hover === i && (
                  <text
                    x={cx}
                    y={v >= 0 ? top0 - 8 : top0 + h + 16}
                    textAnchor="middle"
                    fontSize="11"
                    fill={C.ink}
                  >
                    {valueFormat(v)}
                  </text>
                )}
              </g>
            );
          })}

          {items.map((it, i) => {
            const cx = padL + step * (i + 0.5);
            const ls = fit.lines[i];
            return (
              <text
                key={`t-${it.label}`}
                x={cx}
                y={height - 12 - (ls.length - 1) * fit.lineH}
                textAnchor="middle"
                fontSize={fit.fontSize}
                fill={it.active ? C.ink : C.ink3}
                style={{ opacity: on ? 1 : 0, transition: `opacity .5s ${EASE} .3s` }}
              >
                {ls.map((line, li) => (
                  <tspan key={li} x={cx} dy={li === 0 ? 0 : fit.lineH}>
                    {line}
                  </tspan>
                ))}
              </text>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/* ==========================================================================
   瀑布图：利润形成路径
   ========================================================================== */

export function Waterfall({
  steps,
  height = 268,
  valueFormat = (n: number) => fmtWan(n),
}: {
  steps: { label: string; delta: number; isTotal?: boolean }[];
  height?: number;
  valueFormat?: (n: number) => string;
}) {
  const [wrapRef, wrapW] = useMeasure<HTMLDivElement>();
  const [ref, w] = useMeasure<HTMLDivElement>();
  const on = useEnter();
  const [hover, setHover] = useState<number | null>(null);

  if (steps.length === 0) return <div className="empty">暂无数据</div>;

  /* 累计坐标 */
  let acc = 0;
  const bars = steps.map((s) => {
    const start = s.isTotal ? 0 : acc;
    const end = s.isTotal ? s.delta : acc + s.delta;
    acc = end;
    return { ...s, from: Math.min(start, end), to: Math.max(start, end), base: start, top: end };
  });

  const padL = 58;
  const padR = 16;
  const padT = 32;
  const iw = Math.max(20, w - padL - padR);
  /* 标签折行会导致底部留白增加，先算出来再定绘图区高度 */
  const fit = fitLabels(bars.map((b) => b.label), iw / bars.length, 46);
  const padB = fit.padB;
  const ih = Math.max(40, height - padT - padB);
  /* 数值不得越过 labelLimit，否则会压到底部科目名 */
  const labelLastY = height - 28;
  const subY = height - 12;
  const labelLimit = height - padB - 4;

  const hi = Math.max(0, ...bars.map((b) => Math.max(b.from, b.to)));
  const lo = Math.min(0, ...bars.map((b) => Math.min(b.from, b.to)));
  const top = niceCeil(hi || 1);
  const bottom = lo < 0 ? -niceCeil(-lo) : 0;
  const span = top - bottom || 1;

  const step = iw / bars.length;
  const bw = Math.min(56, step * 0.56);
  const y = (v: number) => padT + ih - ((v - bottom) / span) * ih;
  const ticks = Array.from({ length: 5 }, (_, i) => bottom + (span * i) / 4);

  /* 柱位过窄时数值文字会互相压住，给最小宽度并允许横向滚动 */
  const minW = Math.round(padL + padR + bars.length * 48);
  const needScroll = wrapW > 0 && minW > wrapW + 1;

  return (
    <>
      <div className="viz-scroll" ref={wrapRef}>
        <div className="viz" ref={ref} style={{ minWidth: minW }}>
          {w > 0 && (
            <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} role="img">
              {ticks.map((t, i) => (
                <g key={i}>
                  <line
                    x1={padL}
                    x2={padL + iw}
                    y1={y(t)}
                    y2={y(t)}
                    stroke={t === 0 ? C.line : C.soft}
                    style={{ opacity: on ? 1 : 0, transition: `opacity .5s ${EASE} ${i * 40}ms` }}
                  />
                  <text
                    x={padL - 10}
                    y={y(t) + 4}
                    textAnchor="end"
                    fontSize="11"
                    fill={C.ink3}
                    style={{ opacity: on ? 1 : 0, transition: `opacity .5s ${EASE} ${i * 40}ms` }}
                  >
                    {valueFormat(t)}
                  </text>
                </g>
              ))}

              {bars.map((b, i) => {
                const cx = padL + step * (i + 0.5);
                const yTop = y(b.to);
                const yBot = y(b.from);
                const h = Math.max(2, yBot - yTop);
                const isUp = b.delta >= 0;
                const fill = b.isTotal ? grey(0) : isUp ? grey(2) : grey(4);

                /*
                 * 数值放在柱体外侧：累加项放柱顶上方、扣减项放柱底下方。
                 * 小计柱从基线起算（柱底＝基线），扣减项累计接近 0 时也一样，
                 * 直接放「柱底下方」会正好压住底部科目名，因此超过 labelLimit
                 * 就改放柱顶上方。
                 */
                let labelY = b.delta >= 0 ? yTop - 8 : yBot + 15;
                if (labelY > labelLimit) labelY = Math.min(yTop - 8, labelLimit);
                if (labelY < 16) labelY = 16;

                const ls = fit.lines[i];

                return (
                  <g key={b.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                    <rect x={padL + step * i} y={padT} width={step} height={ih} fill="transparent" />
                    {i > 0 && (
                      <line
                        x1={padL + step * i}
                        x2={padL + step * (i + 1) - bw / 2}
                        y1={y(bars[i - 1].top)}
                        y2={y(bars[i - 1].top)}
                        stroke={C.ink3}
                        strokeWidth="1"
                        strokeDasharray="2 3"
                        style={{ opacity: on ? 0.7 : 0, transition: `opacity .5s ${EASE} ${i * 90}ms` }}
                      />
                    )}
                    <rect
                      x={cx - bw / 2}
                      y={on ? yTop : yBot}
                      width={bw}
                      height={on ? h : 1}
                      rx="3"
                      fill={hover === i ? C.accent : fill}
                      style={{
                        transition: `y .7s ${EASE} ${i * 80}ms, height .7s ${EASE} ${i * 80}ms, fill .2s ${EASE}`,
                      }}
                    />
                    <text
                      x={cx}
                      y={labelY}
                      textAnchor="middle"
                      fontSize="11"
                      fill={hover === i ? C.ink : C.ink2}
                      style={{
                        opacity: on ? 1 : 0,
                        transition: `opacity .5s ${EASE} ${i * 80 + 200}ms`,
                      }}
                    >
                      {valueFormat(b.delta)}
                    </text>
                    <text
                      x={cx}
                      y={labelLastY - (ls.length - 1) * fit.lineH}
                      textAnchor="middle"
                      fontSize={fit.fontSize + 0.5}
                      fill={b.isTotal ? C.ink : C.ink2}
                      style={{ opacity: on ? 1 : 0, transition: `opacity .5s ${EASE} .3s` }}
                    >
                      {ls.map((line, li) => (
                        <tspan key={li} x={cx} dy={li === 0 ? 0 : fit.lineH}>
                          {line}
                        </tspan>
                      ))}
                    </text>
                    <text
                      x={cx}
                      y={subY}
                      textAnchor="middle"
                      fontSize="10"
                      fill={C.ink3}
                      style={{ opacity: on ? 1 : 0, transition: `opacity .5s ${EASE} .35s` }}
                    >
                      {b.isTotal ? "小计" : b.delta >= 0 ? "＋" : "－"}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </div>
      {needScroll && (
        <p className="micro viz-scroll-hint">图表较宽，可左右滑动查看</p>
      )}
    </>
  );
}

/* ==========================================================================
   分组柱：本期 vs 上期
   ========================================================================== */

export function GroupedColumns({
  rows,
  height = 236,
  valueFormat = (n: number) => fmtWan(n),
  currentLabel = "本期",
  priorLabel = "上期",
}: {
  rows: { label: string; current: number; prior: number }[];
  height?: number;
  valueFormat?: (n: number) => string;
  currentLabel?: string;
  priorLabel?: string;
}) {
  const [ref, w] = useMeasure<HTMLDivElement>();
  const on = useEnter();
  const [hover, setHover] = useState<string | null>(null);

  if (rows.length === 0) return <div className="empty">暂无数据</div>;

  const padL = 58;
  const padR = 16;
  const padT = 24;
  const iw = Math.max(20, w - padL - padR);
  const step = iw / rows.length;
  /* 柱位放不下一行标签时折行，底部留白随之加高 */
  const fit = fitLabels(rows.map((r) => r.label), step, 34);
  const padB = fit.padB;
  const ih = Math.max(40, height - padT - padB);

  const top = niceCeil(Math.max(1, ...rows.flatMap((r) => [r.current, r.prior])));
  const y = (v: number) => padT + ih - (Math.max(0, v) / top) * ih;
  const bw = Math.min(30, step * 0.3);
  const ticks = Array.from({ length: 5 }, (_, i) => (top * i) / 4);

  return (
    <div className="viz" ref={ref}>
      {w > 0 && (
        <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} role="img">
          {ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={padL}
                x2={padL + iw}
                y1={y(t)}
                y2={y(t)}
                stroke={i === 0 ? C.line : C.soft}
                style={{ opacity: on ? 1 : 0, transition: `opacity .5s ${EASE} ${i * 40}ms` }}
              />
              <text
                x={padL - 10}
                y={y(t) + 4}
                textAnchor="end"
                fontSize="11"
                fill={C.ink3}
                style={{ opacity: on ? 1 : 0, transition: `opacity .5s ${EASE} ${i * 40}ms` }}
              >
                {valueFormat(t)}
              </text>
            </g>
          ))}

          {rows.map((r, i) => {
            const cx = padL + step * (i + 0.5);
            const hot = hover === r.label;
            const ls = fit.lines[i];
            return (
              <g key={r.label} onMouseEnter={() => setHover(r.label)} onMouseLeave={() => setHover(null)}>
                <rect x={padL + step * i} y={padT} width={step} height={ih} fill="transparent" />
                {[
                  { v: r.current, x: cx - bw - 3, fill: hot ? C.accent : grey(0), key: "c" },
                  { v: r.prior, x: cx + 3, fill: grey(3), key: "p" },
                ].map((b) => (
                  <rect
                    key={b.key}
                    x={b.x}
                    y={on ? y(b.v) : y(0)}
                    width={bw}
                    height={on ? Math.max(2, y(0) - y(b.v)) : 1}
                    rx="3"
                    fill={b.fill}
                    style={{
                      transition: `y .7s ${EASE} ${i * 60}ms, height .7s ${EASE} ${i * 60}ms, fill .2s ${EASE}`,
                    }}
                  />
                ))}
                <text
                  x={cx}
                  y={height - 14 - (ls.length - 1) * fit.lineH}
                  textAnchor="middle"
                  fontSize={fit.fontSize + 0.5}
                  fill={C.ink2}
                  style={{ opacity: on ? 1 : 0, transition: `opacity .5s ${EASE} .3s` }}
                >
                  {ls.map((line, li) => (
                    <tspan key={li} x={cx} dy={li === 0 ? 0 : fit.lineH}>
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })}
        </svg>
      )}

      <div className="viz-legend" style={{ marginTop: 4 }}>
        <span className="viz-legend__item">
          <i className="viz-legend__dot" style={{ background: grey(0) }} />
          {currentLabel}
        </span>
        <span className="viz-legend__item">
          <i className="viz-legend__dot" style={{ background: grey(3) }} />
          {priorLabel}
        </span>
      </div>
    </div>
  );
}

/* ==========================================================================
   比率条（百分比或倍数）
   ========================================================================== */

export function RatioBars({
  items,
}: {
  items: { label: string; value: number; unit: "%" | "倍"; hint: string; level: "good" | "warn" | "plain" }[];
}) {
  const on = useEnter();
  if (items.length === 0) return <div className="empty">暂无数据</div>;

  return (
    <div className="ratios">
      {items.map((it, i) => {
        const width = it.unit === "%" ? clamp(it.value, 0, 100) : clamp((it.value / 3) * 100, 0, 100);
        return (
          <div className="ratio" key={it.label}>
            <div className="ratio__top">
              <span className="ratio__label">
                {it.label}
                {it.level === "warn" && <span className="ratio__note">留意</span>}
              </span>
              <b className="num">
                {it.unit === "%" ? `${it.value.toFixed(2)}%` : `${it.value.toFixed(2)} 倍`}
              </b>
            </div>
            <div className="ratio__track">
              <div
                className="ratio__fill"
                style={{
                  width: on ? `${width}%` : 0,
                  transition: `width .85s ${EASE} ${i * 70}ms`,
                }}
              />
            </div>
            <div className="ratio__hint micro">{it.hint}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ==========================================================================
   横向堆叠条：票种结构等
   ========================================================================== */

export function StackedBars({
  rows,
  labels,
  valueFormat = (n: number) => fmtWan(n),
}: {
  rows: { label: string; parts: number[] }[];
  labels: string[];
  valueFormat?: (n: number) => string;
}) {
  const on = useEnter();
  if (rows.length === 0) return <div className="empty">暂无数据</div>;

  const cols = labels.map((l, i) => ({ name: l, color: grey(i + 1) }));

  return (
    <div className="stacked">
      <Legend items={cols} />
      {rows.map((row, ri) => {
        const total = row.parts.reduce((s, v) => s + v, 0);
        return (
          <div className="stacked__row" key={row.label}>
            <span className="stacked__label">{row.label}</span>
            <div className="stacked__track">
              {row.parts.map((v, i) => (
                <div
                  key={labels[i]}
                  className="stacked__fill"
                  style={{
                    width: on && total > 0 ? `${(v / total) * 100}%` : 0,
                    background: grey(i + 1),
                    transition: `width .85s ${EASE} ${(ri * 2 + i) * 70}ms`,
                  }}
                  title={`${labels[i]} ${valueFormat(v)}`}
                />
              ))}
            </div>
            <span className="stacked__value num">{valueFormat(total)}</span>
          </div>
        );
      })}
    </div>
  );
}
