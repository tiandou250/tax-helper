"use client";

import { useMemo, useRef, useState } from "react";
import { fmtMoney, fmtNumber, parseAmount } from "@/lib/format";
import { downloadCsv } from "@/lib/report";
import { periodLabel } from "@/lib/period";
import type { TaxResult } from "@/lib/tax";
import {
  KIND_LABEL as STMT_LABEL,
  LINES,
  manualStatement,
  parseStatementFile,
  parseStatementText,
  pickStatements,
  summarizeProfit,
  type DiffRow,
  type StatementDoc,
  type StatementKind,
} from "@/lib/statement";

/* ------------------------------------------------------------------ */
/* 手工录入 / 粘贴                                                     */
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
            <h3 className="h3">手工录入财务报表</h3>
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
  const [error, setError] = useState("");
  const parsed = useMemo(() => (text.trim() ? parseStatementText(text, "粘贴文本") : null), [text]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <div>
            <h3 className="h3">粘贴财务报表</h3>
            <p className="micro" style={{ marginTop: 8 }}>
              从 Excel 或 PDF 里复制后直接粘贴，支持「科目 + 金额」两列或「营业收入：1,000,000」逐行写法
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
          onChange={(e) => {
            setText(e.target.value);
            setError("");
          }}
        />

        {parsed && (
          <div className="warn-box" style={{ marginTop: 14 }}>
            识别为「{STMT_LABEL[parsed.kind]}」，期间 {parsed.period || "未识别"}，共 {Object.keys(parsed.items).length} 个科目。
          </div>
        )}
        {text.trim() && !parsed && (
          <div className="error-box" style={{ marginTop: 14 }}>
            没能识别出报表类型，请确认内容包含「营业收入 / 资产总计 / 经营活动产生的现金流量净额」等科目名。
          </div>
        )}
        {error && <div className="error-box" style={{ marginTop: 14 }}>{error}</div>}

        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={onClose}>
            取消
          </button>
          <button
            className="btn btn--primary"
            disabled={!parsed}
            onClick={() => {
              if (!parsed) {
                setError("没有可导入的内容");
                return;
              }
              onSave([{ ...parsed, period: parsed.period || period || new Date().toISOString().slice(0, 7) }]);
            }}
          >
            导入
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 主区块                                                              */
/* ------------------------------------------------------------------ */

const CARD_FIELDS: Record<StatementKind, string[]> = {
  profit: ["revenue", "cost", "taxSurcharge", "expenses", "totalProfit", "incomeTaxExpense", "netProfit"],
  balance: ["cash", "receivable", "inventory", "totalAssets", "totalLiab", "totalEquity", "taxPayable"],
  cashflow: ["salesCash", "taxPaid", "operatingNet", "endingCash"],
};

function labelOf(kind: StatementKind, key: string): string {
  if (key === "expenses") return "期间费用合计";
  return LINES[kind].find((l) => l.key === key)?.label ?? key;
}

export function StatementSection({
  docs,
  activePeriod,
  tax,
  diffs,
  onImport,
  onRemove,
  onPeriodChange,
  notify,
}: {
  docs: StatementDoc[];
  activePeriod: string;
  tax: TaxResult;
  diffs: DiffRow[];
  onImport: (docs: StatementDoc[]) => void;
  onRemove: (id: string) => void;
  onPeriodChange: (id: string, period: string) => void;
  notify: (msg: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [paste, setPaste] = useState(false);
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);

  const current = useMemo(() => pickStatements(docs, activePeriod), [docs, activePeriod]);

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
    if (out.length) onImport(out);
    if (failed.length) notify(`${failed.length} 个文件没识别出报表：${failed[0]}`);
  };

  const downloadTemplate = () => {
    const rows: (string | number)[][] = [["项目", "行次", "本期金额", "上期金额"]];
    LINES.profit.forEach((l, i) => rows.push([l.label, i + 1, "", ""]));
    downloadCsv("财务报表模板-利润表.csv", rows);
  };

  const exportDoc = (doc: StatementDoc) => {
    const rows: (string | number)[][] = [["科目", "金额"]];
    for (const l of LINES[doc.kind]) {
      if (doc.items[l.key] !== undefined) rows.push([l.label, doc.items[l.key]]);
    }
    downloadCsv(`${STMT_LABEL[doc.kind]}-${doc.period || "未标期间"}.csv`, rows);
  };

  const periodDocs = docs.filter((d) => d.kind && current[d.kind] && current[d.kind]!.id === d.id);

  return (
    <>
      <div className="section__head">
        <div>
          <h2 className="h2">财务报表</h2>
          <p className="sub" style={{ marginTop: 12 }}>
            导入利润表、资产负债表、现金流量表后，企业所得税改用账簿利润总额计算，并与发票口径逐项勾稽
          </p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn--text" onClick={downloadTemplate}>
            下载模板
          </button>
        </div>
      </div>

      <div className="card">
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
          style={{ cursor: "pointer" }}
        >
          <p className="body">
            {busy ? "正在解析…" : "把财务报表拖到这里，或点此选择文件"}
          </p>
          <p className="micro" style={{ marginTop: 8 }}>
            支持 .xlsx / .xls / .csv；三张表可以放在同一个 Excel 的不同工作表里，自动识别类型与期间
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

        <div className="row" style={{ gap: 12, marginTop: 16, flexWrap: "wrap" }}>
          <button className="btn btn--ghost" onClick={() => setPaste(true)}>
            粘贴报表
          </button>
          <button className="btn btn--ghost" onClick={() => setManual(true)}>
            手工填表
          </button>
          <span className="micro" style={{ alignSelf: "center" }}>
            {docs.length > 0 ? `已导入 ${docs.length} 份` : "还没有导入财务报表"}
          </span>
        </div>

        {docs.length > 0 && (
          <div className="list" style={{ marginTop: 18 }}>
            {docs.map((d) => (
              <div className="list__row" key={d.id} style={{ gap: 12 }}>
                <span className="row" style={{ gap: 10, minWidth: 0 }}>
                  <span className="tag tag--ink">{STMT_LABEL[d.kind]}</span>
                  <input
                    className="input"
                    style={{ width: 110, height: 30, fontSize: 13 }}
                    value={d.period}
                    placeholder="2026-10"
                    onChange={(e) => onPeriodChange(d.id, e.target.value)}
                  />
                  <span className="micro ellipsis" title={d.source} style={{ maxWidth: 240 }}>
                    {d.source}
                  </span>
                  <span className="micro">{Object.keys(d.items).length} 个科目</span>
                </span>
                <span className="row" style={{ gap: 12 }}>
                  <button className="btn--text" onClick={() => exportDoc(d)} style={{ fontSize: 13 }}>
                    导出
                  </button>
                  <button className="btn--text" onClick={() => onRemove(d.id)} style={{ fontSize: 13 }}>
                    移除
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}

        {periodDocs.flatMap((d) => d.warnings).slice(0, 4).map((w, i) => (
          <div className="warn-box" style={{ marginTop: 14 }} key={`${i}-${w.slice(0, 8)}`}>
            {w}
          </div>
        ))}
      </div>

      {/* 三张报表的关键科目 */}
      <div className="grid grid--3" style={{ marginTop: 20 }}>
        {(["profit", "balance", "cashflow"] as StatementKind[]).map((k) => {
          const doc = current[k];
          return (
            <div className="card" key={k} style={{ height: "100%" }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h3 className="h3">{STMT_LABEL[k]}</h3>
                <span className="micro">{doc?.period ? periodLabel(doc.period) : "未导入"}</span>
              </div>
              {doc ? (
                <div className="list" style={{ marginTop: 14 }}>
                  {CARD_FIELDS[k].map((f) => {
                    const value =
                      f === "expenses" && k === "profit"
                        ? summarizeProfit(doc).expenses
                        : doc.items[f];
                    if (value === undefined) return null;
                    return (
                      <div className="list__row" key={f}>
                        <span className="micro" style={{ color: "var(--ink)" }}>
                          {labelOf(k, f)}
                        </span>
                        <span className="num">{fmtNumber(value, 0)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty" style={{ marginTop: 14 }}>
                  未导入
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 勾稽核对 */}
      {diffs.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
            <h3 className="h3">报表口径与发票口径勾稽</h3>
            <span className="micro">差异超过 1 元标黄</span>
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
            利润口径：{tax.profitSource === "book" ? "利润表（账簿）" : tax.profitSource === "invoice" ? "发票推算" : "无数据"}
            {tax.profitSource === "book" && ` · 利润总额 ${fmtMoney(tax.profit, 0)}`}
          </p>
        </div>
      )}

      {paste && (
        <PasteModal
          period={activePeriod}
          onClose={() => setPaste(false)}
          onSave={(list) => {
            onImport(list);
            setPaste(false);
          }}
        />
      )}
      {manual && (
        <ManualModal
          kind="profit"
          period={activePeriod}
          onClose={() => setManual(false)}
          onSave={(list) => {
            onImport(list);
            setManual(false);
          }}
        />
      )}
    </>
  );
}
