"use client";

import { useMemo, useRef, useState } from "react";
import { fmtMoney, fmtNumber, parseAmount } from "@/lib/format";
import { downloadCsv } from "@/lib/report";
import { periodLabel } from "@/lib/period";
import type { TaxResult } from "@/lib/tax";
import {
  KIND_LABEL as STMT_LABEL,
  KEY_METRICS,
  LINES,
  manualStatement,
  metricLabel,
  metricValue,
  parseStatementFile,
  parseStatementText,
  pickStatements,
  type DiffRow,
  type StatementDoc,
  type StatementKind,
} from "@/lib/statement";

/* ------------------------------------------------------------------ */
/* 导入后的「核对窗口」                                                 */
/* ------------------------------------------------------------------ */

interface Draft {
  key: string;
  doc: StatementDoc;
  include: boolean;
  kind: StatementKind;
  period: string;
  variantIdx: number;
  values: Record<string, string>;
}

const draftOf = (doc: StatementDoc, i: number): Draft => ({
  key: `${doc.id}-${i}`,
  doc,
  include: true,
  kind: doc.kind,
  period: doc.period,
  variantIdx: 0,
  values: Object.fromEntries(Object.entries(doc.items).map(([k, v]) => [k, String(v)])),
});

function ReviewModal({
  docs,
  onClose,
  onConfirm,
}: {
  docs: StatementDoc[];
  onClose: () => void;
  onConfirm: (docs: StatementDoc[]) => void;
}) {
  const [drafts, setDrafts] = useState<Draft[]>(() => docs.map(draftOf));
  const [active, setActive] = useState(0);
  const cur = drafts[active];

  const patch = (key: string, next: Partial<Draft>) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...next } : d)));

  /** 切换取数口径：整表换成该口径的原始数据 */
  const switchVariant = (idx: number) => {
    const v = cur.doc.variants?.[idx];
    if (!v) return;
    patch(cur.key, {
      variantIdx: idx,
      values: Object.fromEntries(Object.entries(v.items).map(([k, val]) => [k, String(val)])),
    });
  };

  const confirm = () => {
    const out: StatementDoc[] = [];
    for (const d of drafts) {
      if (!d.include) continue;
      const items: Record<string, number> = {};
      for (const [k, v] of Object.entries(d.values)) {
        const n = parseAmount(v);
        if (n !== undefined) items[k] = n;
      }
      out.push({
        ...d.doc,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        kind: d.kind,
        period: d.period.trim(),
        items,
        variantLabel: d.doc.variants?.[d.variantIdx]?.label,
      });
    }
    onConfirm(out);
  };

  const filled = cur ? Object.values(cur.values).filter((v) => parseAmount(v) !== undefined).length : 0;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <div>
            <h3 className="h3">核对识别结果</h3>
            <p className="micro" style={{ marginTop: 8 }}>
              共识别 {docs.length} 份报表，确认无误后再导入；金额可直接改
            </p>
          </div>
          <button className="close" onClick={onClose}>
            关闭
          </button>
        </div>

        {drafts.length > 1 && (
          <div className="seg" style={{ marginBottom: 16, flexWrap: "wrap" }}>
            {drafts.map((d, i) => (
              <button
                key={d.key}
                className={`seg__item ${i === active ? "is-active" : ""}`}
                onClick={() => setActive(i)}
              >
                {STMT_LABEL[d.kind]}
                {d.period ? ` · ${d.period}` : ""}
              </button>
            ))}
          </div>
        )}

        {cur && (
          <>
            <div className="row row--wrap" style={{ gap: 12, marginBottom: 14 }}>
              <label className="field" style={{ maxWidth: 150 }}>
                <span className="field__label">报表类型</span>
                <select
                  className="select"
                  value={cur.kind}
                  onChange={(e) => patch(cur.key, { kind: e.target.value as StatementKind })}
                >
                  {(["profit", "balance", "cashflow"] as StatementKind[]).map((k) => (
                    <option key={k} value={k}>
                      {STMT_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field" style={{ maxWidth: 130 }}>
                <span className="field__label">所属期间</span>
                <input
                  className="input"
                  placeholder="2025-12"
                  value={cur.period}
                  onChange={(e) => patch(cur.key, { period: e.target.value })}
                />
              </label>
              {(cur.doc.variants?.length ?? 0) > 1 && (
                <label className="field" style={{ maxWidth: 200 }}>
                  <span className="field__label">取数口径</span>
                  <select
                    className="select"
                    value={cur.variantIdx}
                    onChange={(e) => switchVariant(Number(e.target.value))}
                  >
                    {cur.doc.variants!.map((v, i) => (
                      <option key={v.label} value={i}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="row" style={{ gap: 8, alignSelf: "flex-end", paddingBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={cur.include}
                  onChange={(e) => patch(cur.key, { include: e.target.checked })}
                />
                <span className="micro">导入这一份</span>
              </label>
            </div>

            <div className="review-scroll">
              <table className="table table--mini">
                <thead>
                  <tr>
                    <th>科目</th>
                    <th className="r" style={{ width: 180 }}>
                      金额
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {LINES[cur.kind].map((l) => {
                    if (!(l.key in cur.values)) return null;
                    return (
                      <tr key={l.key}>
                        <td>{l.label}</td>
                        <td className="r">
                          <input
                            className="input input--num"
                            style={{ height: 30, textAlign: "right", fontSize: 13 }}
                            value={cur.values[l.key]}
                            onChange={(e) =>
                              patch(cur.key, { values: { ...cur.values, [l.key]: e.target.value } })
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="micro" style={{ marginTop: 12 }}>
              已识别 {filled} 个科目
              {cur.doc.source ? ` · 来源 ${cur.doc.source}` : ""}
            </p>

            {cur.doc.unmatched && cur.doc.unmatched.length > 0 && (
              <div className="warn-box" style={{ marginTop: 12 }}>
                这些行没归到标准科目（不计入算税）：{cur.doc.unmatched.slice(0, 8).join("、")}
              </div>
            )}
          </>
        )}

        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn btn--primary" onClick={confirm}>
            确认导入{drafts.length > 1 ? `（${drafts.filter((d) => d.include).length} 份）` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 手工填写 / 粘贴                                                     */
/* ------------------------------------------------------------------ */

function ManualModal({
  kind: initialKind,
  period,
  onClose,
  onSave,
}: {
  kind: StatementKind;
  period: string;
  onClose: () => void;
  onSave: (docs: StatementDoc[]) => void;
}) {
  const [kind, setKind] = useState<StatementKind>(initialKind);
  const [p, setP] = useState(period || new Date().toISOString().slice(0, 7));
  const [vals, setVals] = useState<Record<string, string>>({});
  const defs = LINES[kind];

  const profitPreview = useMemo(() => {
    if (kind !== "profit") return null;
    const g = (k: string) => Number(vals[k] ?? 0) || 0;
    const derived =
      g("revenue") -
      g("cost") -
      g("taxSurcharge") -
      g("selling") -
      g("admin") -
      g("rd") -
      g("finance") +
      g("otherIncome") +
      g("investmentIncome") +
      g("nonOpIncome") -
      g("nonOpExpense");
    return { derived, entered: vals.totalProfit ? Number(vals.totalProfit) : undefined };
  }, [kind, vals]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <div>
            <h3 className="h3">手工填入财务报表</h3>
            <p className="micro" style={{ marginTop: 8 }}>
              只填关键科目即可，留空的按 0 处理
            </p>
          </div>
          <button className="close" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="row row--wrap" style={{ gap: 12, marginBottom: 20 }}>
          <div className="seg">
            {(["profit", "balance", "cashflow"] as StatementKind[]).map((k) => (
              <button
                key={k}
                className={`seg__item ${kind === k ? "is-active" : ""}`}
                onClick={() => {
                  setKind(k);
                  setVals({});
                }}
              >
                {STMT_LABEL[k]}
              </button>
            ))}
          </div>
          <label className="field" style={{ maxWidth: 160 }}>
            <span className="field__label">所属期间</span>
            <input className="input" value={p} onChange={(e) => setP(e.target.value)} placeholder="2026-10" />
          </label>
        </div>

        <div className="grid grid--2" style={{ gap: 16 }}>
          {defs.map((d) => (
            <label className="field" key={d.key}>
              <span className="field__label">{d.label}</span>
              <input
                className="input input--num"
                inputMode="decimal"
                placeholder="0.00"
                value={vals[d.key] ?? ""}
                onChange={(e) => setVals((v) => ({ ...v, [d.key]: e.target.value }))}
              />
            </label>
          ))}
        </div>

        {profitPreview && (
          <div className="card card--outline" style={{ padding: 16, marginTop: 20 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="body muted">按已填科目推算的利润总额</span>
              <span className="body num">{fmtMoney(profitPreview.derived)}</span>
            </div>
            {profitPreview.entered !== undefined && (
              <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
                <span className="body muted">表中填写的利润总额</span>
                <span className="body num">{fmtMoney(profitPreview.entered)}</span>
              </div>
            )}
          </div>
        )}

        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={onClose}>
            取消
          </button>
          <button
            className="btn btn--primary"
            onClick={() => {
              const values: Record<string, number> = {};
              for (const [k, v] of Object.entries(vals)) {
                const n = parseAmount(v);
                if (n !== undefined) values[k] = n;
              }
              if (Object.keys(values).length === 0) return;
              onSave([manualStatement(kind, p.trim(), values)]);
            }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function PasteModal({
  period,
  onClose,
  onSave,
}: {
  period: string;
  onClose: () => void;
  onSave: (docs: StatementDoc[]) => void;
}) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => (text.trim() ? parseStatementText(text, "粘贴文本") : null), [text]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <div>
            <h3 className="h3">粘贴财务报表</h3>
            <p className="micro" style={{ marginTop: 8 }}>
              从 Excel 或 PDF 复制后直接粘贴，支持「科目 + 金额」两列或「营业收入：1,000,000」逐行写法
            </p>
          </div>
          <button className="close" onClick={onClose}>
            关闭
          </button>
        </div>

        <textarea
          className="input import-textarea"
          rows={12}
          value={text}
          placeholder={"项目\t本期金额\n营业收入\t1200000\n营业成本\t700000\n利润总额\t219000"}
          onChange={(e) => setText(e.target.value)}
        />

        {parsed && (
          <div className="warn-box" style={{ marginTop: 14 }}>
            识别为「{STMT_LABEL[parsed.kind]}」，期间 {parsed.period || "未识别"}，共{" "}
            {Object.keys(parsed.items).length} 个科目。
          </div>
        )}
        {text.trim() && !parsed && (
          <div className="error-box" style={{ marginTop: 14 }}>
            没能识别出报表类型，请确认内容包含「营业收入 / 资产总计 / 经营活动产生的现金流量净额」等科目名。
          </div>
        )}

        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={onClose}>
            取消
          </button>
          <button
            className="btn btn--primary"
            disabled={!parsed}
            onClick={() => {
              if (!parsed) return;
              onSave([{ ...parsed, period: parsed.period || period || new Date().toISOString().slice(0, 7) }]);
            }}
          >
            下一步
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 左栏：导入                                                          */
/* ------------------------------------------------------------------ */

export function StatementImport({
  docs,
  period,
  onImport,
  onRemove,
  onPeriodChange,
  onVariantChange,
  notify,
}: {
  docs: StatementDoc[];
  period: string;
  onImport: (docs: StatementDoc[]) => void;
  onRemove: (id: string) => void;
  onPeriodChange: (id: string, period: string) => void;
  onVariantChange: (id: string, label: string) => void;
  notify: (msg: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState(false);
  const [manual, setManual] = useState(false);
  const [review, setReview] = useState<StatementDoc[] | null>(null);

  const handleFiles = async (list: FileList | File[] | null) => {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    setBusy(true);
    const out: StatementDoc[] = [];
    const failed: string[] = [];
    for (const f of files) {
      try {
        const parsed = await parseStatementFile(f);
        if (parsed.length === 0) failed.push(f.name);
        else out.push(...parsed);
      } catch {
        failed.push(f.name);
      }
    }
    setBusy(false);
    if (out.length) setReview(out);
    if (failed.length) notify(`${failed.length} 个文件没识别出报表：${failed[0]}`);
  };

  const downloadTemplate = () => {
    const rows: (string | number)[][] = [["项目", "行次", "本期金额", "上期金额"]];
    LINES.profit.forEach((l, i) => rows.push([l.label, i + 1, "", ""]));
    downloadCsv("财务报表模板-利润表.csv", rows);
  };

  return (
    <>
      <div className="card card--aside">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
          <h2 className="h3">导入报表</h2>
          <button className="btn--text" onClick={downloadTemplate}>
            下载模板
          </button>
        </div>
        <p className="micro" style={{ marginTop: 6 }}>
          Excel / CSV 三表通用，自动识别类型与期间
        </p>

        <div
          className={`drop drop--sm ${over ? "is-over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void handleFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          style={{ cursor: "pointer", marginTop: 14 }}
        >
          <p className="body">{busy ? "正在解析…" : "拖入报表，或点此选择"}</p>
          <p className="micro" style={{ marginTop: 6 }}>
            三张表可放在同一 Excel 的不同工作表
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".xlsx,.xls,.csv,.et,.txt,.tsv"
            style={{ display: "none" }}
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <button className="btn btn--ghost btn--sm" onClick={() => setPaste(true)}>
            粘贴报表
          </button>
          <button className="btn btn--ghost btn--sm" onClick={() => setManual(true)}>
            手工填表
          </button>
        </div>

        {docs.length > 0 && (
          <div className="aside-list">
            {docs.map((d) => (
              <div className="aside-item" key={d.id}>
                <div className="aside-item__top">
                  <span className="tag tag--ink">{STMT_LABEL[d.kind]}</span>
                  <button className="btn--text" onClick={() => onRemove(d.id)} style={{ fontSize: 12 }}>
                    移除
                  </button>
                </div>
                <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <input
                    className="input"
                    style={{ width: 96, height: 28, fontSize: 12 }}
                    value={d.period}
                    placeholder="2026-10"
                    onChange={(e) => onPeriodChange(d.id, e.target.value)}
                  />
                  {(d.variants?.length ?? 0) > 1 ? (
                    <select
                      className="select"
                      style={{ height: 28, fontSize: 12, width: 120 }}
                      value={d.variantLabel ?? ""}
                      onChange={(e) => onVariantChange(d.id, e.target.value)}
                    >
                      {d.variants!.map((v) => (
                        <option key={v.label} value={v.label}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="micro">{d.variantLabel ?? "金额"}</span>
                  )}
                </div>
                <p className="micro ellipsis" title={d.source} style={{ marginTop: 6 }}>
                  {d.source} · {Object.keys(d.items).length} 个科目
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {review && (
        <ReviewModal
          docs={review}
          onClose={() => setReview(null)}
          onConfirm={(list) => {
            onImport(list);
            setReview(null);
          }}
        />
      )}
      {paste && (
        <PasteModal
          period={period}
          onClose={() => setPaste(false)}
          onSave={(list) => {
            setPaste(false);
            setReview(list);
          }}
        />
      )}
      {manual && (
        <ManualModal
          kind="profit"
          period={period}
          onClose={() => setManual(false)}
          onSave={(list) => {
            setManual(false);
            onImport(list);
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 右栏：分析结果                                                      */
/* ------------------------------------------------------------------ */

export function StatementAnalysis({
  docs,
  activePeriod,
  tax,
  diffs,
}: {
  docs: StatementDoc[];
  activePeriod: string;
  tax: TaxResult;
  diffs: DiffRow[];
}) {
  const current = useMemo(() => pickStatements(docs, activePeriod), [docs, activePeriod]);

  if (docs.length === 0) {
    return (
      <div className="card card--empty">
        <p className="body">还没有导入财务报表</p>
        <p className="micro" style={{ marginTop: 8, maxWidth: 460 }}>
          在左侧导入利润表 / 资产负债表 / 现金流量表后，企业所得税会改用账簿利润总额计算，并与发票口径逐项勾稽。
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid--3">
        {(["profit", "balance", "cashflow"] as StatementKind[]).map((k) => {
          const doc = current[k];
          return (
            <div className="card" key={k} style={{ height: "100%" }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h3 className="h3">{STMT_LABEL[k]}</h3>
                <span className="micro">{doc?.period ? periodLabel(doc.period) : "未导入"}</span>
              </div>
              {doc ? (
                <>
                  <p className="micro" style={{ marginTop: 6 }}>
                    {doc.variantLabel ? `取数：${doc.variantLabel}` : ""}
                  </p>
                  <div className="list" style={{ marginTop: 10 }}>
                    {KEY_METRICS[k].map((f) => {
                      const value = metricValue(doc, f);
                      if (value === undefined) return null;
                      return (
                        <div className="list__row" key={f}>
                          <span className="micro" style={{ color: "var(--ink)" }}>
                            {metricLabel(k, f)}
                          </span>
                          <span className="num">{fmtNumber(value, 0)}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="empty" style={{ marginTop: 14 }}>
                  未导入
                </div>
              )}
            </div>
          );
        })}
      </div>

      {diffs.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
            <h3 className="h3">报表口径与发票口径勾稽</h3>
            <span className="micro">差异超过 1 元标红</span>
          </div>
          <div className="table-scroll">
            <table className="table table--tax">
              <thead>
                <tr>
                  <th>核对项</th>
                  <th className="r">报表数</th>
                  <th className="r">测算数</th>
                  <th className="r">差异</th>
                </tr>
              </thead>
              <tbody>
                {diffs.map((d) => (
                  <tr key={d.label}>
                    <td>
                      <div className="cell-strong">{d.label}</div>
                      <div className="micro">{d.note}</div>
                    </td>
                    <td className="r">{d.book === undefined ? "—" : fmtNumber(d.book, 2)}</td>
                    <td className="r">{d.invoice === undefined ? "—" : fmtNumber(d.invoice, 2)}</td>
                    <td className="r cell-strong" style={{ color: d.level === "warn" ? "#B42318" : undefined }}>
                      {d.diff > 0 ? "+" : ""}
                      {fmtNumber(d.diff, 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="micro" style={{ marginTop: 14 }}>
            利润口径：
            {tax.profitSource === "book" ? "利润表（账簿）" : tax.profitSource === "invoice" ? "发票推算" : "无数据"}
            {tax.profitSource === "book" && ` · 利润总额 ${fmtMoney(tax.profit, 0)}`}
            {current.profit ? ` · 当前取「${current.profit.variantLabel ?? "金额"}」` : ""}
          </p>
        </div>
      )}
    </>
  );
}
