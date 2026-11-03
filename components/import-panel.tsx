"use client";

import { useMemo, useRef, useState } from "react";
import type { Invoice } from "@/lib/types";
import { fmtMoney } from "@/lib/format";
import {
  parseCsv,
  parseFiles,
  rowsToInvoices,
  TEMPLATE_CSV,
  type FileResult,
} from "@/lib/parse";

type Entry = FileResult & { uid: string; status: "parsing" | "done" | "error" };

const ACCEPT = /\.(pdf|ofd|xml|jpg|jpeg|png|webp|bmp|csv|xlsx|xls|txt|tsv)$/i;

const TAG_LABEL: Record<string, string> = {
  sheet: "已识别",
  structured: "已识别",
  text: "请核对",
  qr: "待补录",
};

export function ImportPanel({
  onImport,
  onManual,
  onClear,
  hasData,
  companyName,
}: {
  onImport: (invoices: Invoice[]) => void;
  onManual: () => void;
  /** 一键清空（含发票与财务报表） */
  onClear?: () => void;
  hasData?: boolean;
  companyName?: string;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [over, setOver] = useState(false);
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [paste, setPaste] = useState("");
  const [pasteRows, setPasteRows] = useState<Invoice[] | null>(null);
  const [pasteError, setPasteError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (fileList: FileList | File[] | null) => {
    const files = Array.from(fileList ?? []).filter((f) => ACCEPT.test(f.name));
    if (files.length === 0) {
      setEntries((prev) => [
        {
          uid: `e-${Date.now()}`,
          name: "文件格式不支持",
          size: 0,
          status: "error",
          invoices: [],
          errors: ["支持 PDF / OFD / XML / JPG / PNG，也支持 CSV / Excel。"],
          warnings: [],
          total: 0,
        },
        ...prev,
      ]);
      return;
    }

    const stamp = Date.now();
    const initial: Entry[] = files.map((f, i) => ({
      uid: `${stamp}-${i}`,
      name: f.name,
      size: f.size,
      status: "parsing",
      invoices: [],
      errors: [],
      warnings: [],
      total: 0,
    }));
    setEntries((prev) => [...initial, ...prev]);

    const results = await parseFiles(files, companyName);
    setEntries((prev) =>
      prev.map((e) => {
        const idx = initial.findIndex((i) => i.uid === e.uid);
        if (idx < 0) return e;
        const r = results[idx];
        return {
          ...e,
          ...r,
          status: r.invoices.length > 0 ? "done" : "error",
        };
      }),
    );
  };

  const pending = useMemo(() => entries.flatMap((e) => e.invoices), [entries]);
  const totalRows = entries.reduce((s, e) => s + e.total, 0);
  const errors = entries.flatMap((e) => e.errors.map((msg) => `${e.name}：${msg}`));
  const notes = entries.flatMap((e) => e.warnings.map((msg) => `${e.name}：${msg}`));

  const handlePaste = () => {
    const res = rowsToInvoices(parseCsv(paste));
    if (res.invoices.length === 0) {
      setPasteRows(null);
      setPasteError(res.errors[0] ?? "没有识别到有效数据，请检查表头是否包含金额列。");
      return;
    }
    setPasteError("");
    setPasteRows(res.invoices);
  };


  const confirmImport = (list: Invoice[]) => {
    if (!list.length) return;
    onImport(list);
    setEntries([]);
    setPaste("");
    setPasteRows(null);
    setMode("file");
  };

  const importable = mode === "paste" ? pasteRows ?? [] : pending;

  return (
    <div className="card card--pad-lg card--hover">
      <div className="import-head">
        <div>
          <h1 className="h2">导入发票</h1>
          <p className="sub" style={{ marginTop: 12 }}>
            直接拖入发票原件：PDF、OFD、XML 或照片，可多选批量识别 · 导入后可在下方查看税金测算与经营看板
          </p>
        </div>
        {hasData && onClear && (
          <button className="btn--text" onClick={onClear} style={{ color: "#B42318" }}>
            清空数据
          </button>
        )}
      </div>

      <div className="import-tabs">
        <div className="seg">
          <button
            className={`seg__item ${mode === "file" ? "is-active" : ""}`}
            onClick={() => setMode("file")}
          >
            上传文件
          </button>
          <button
            className={`seg__item ${mode === "paste" ? "is-active" : ""}`}
            onClick={() => setMode("paste")}
          >
            粘贴表格
          </button>
        </div>
        <span className="micro">数据只在本次会话，关闭标签页即清除，不会上传</span>
      </div>

      {mode === "file" ? (
        <div
          className={`drop drop--lg ${over ? "is-over" : ""}`}
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
        >
          <p className="drop__title">把发票文件拖到这里</p>
          <p className="micro" style={{ marginTop: 10 }}>
            PDF / OFD / XML / JPG · 也可导入 CSV / Excel 汇总表
          </p>
          <div className="row" style={{ justifyContent: "center", marginTop: 24, gap: 12 }}>
            <button className="btn btn--primary" onClick={() => inputRef.current?.click()}>
              选择文件
            </button>
            <button className="btn btn--ghost" onClick={onManual}>
              手动录入
            </button>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.ofd,.xml,.jpg,.jpeg,.png,.webp,.bmp,.csv,.xlsx,.xls,.txt,.tsv"
            style={{ display: "none" }}
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      ) : (
        <div className="field">
          <textarea
            className="input import-textarea"
            placeholder={
              "发票类型,发票种类,开票日期,发票号码,对方单位,商品名称,不含税金额,税率,税额,价税合计\n销项,专票,2026-10-08,001,示例客户,技术服务费,100000,6,6000,106000"
            }
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
          <div className="note-row">
            <span className="micro">{pasteError}</span>
            <div className="row" style={{ gap: 12 }}>
              <button className="btn btn--ghost" onClick={onManual}>
                手动录入
              </button>
              <button className="btn btn--primary" onClick={handlePaste} disabled={!paste.trim()}>
                解析内容
              </button>
            </div>
          </div>
        </div>
      )}

      {mode === "file" && entries.length > 0 && (
        <div className="queue">
          {entries.map((e, idx) => (
            <div
              key={e.uid}
              className="queue__item"
              style={{ animationDelay: `${Math.min(idx, 8) * 60}ms` }}
            >
              <div className="queue__row">
                <span className="queue__name" title={e.name}>
                  {e.name}
                </span>
                <span className="queue__meta micro">
                  {e.status === "parsing" ? (
                    <span className="skeleton" style={{ width: 96, height: 10 }} />
                  ) : e.status === "error" ? (
                    <>
                      未识别到票面要素
                      <button
                        className="btn--text"
                        onClick={onManual}
                        style={{ fontSize: 13, marginLeft: 10 }}
                      >
                        手工补录
                      </button>
                    </>
                  ) : (
                    `识别 ${e.invoices.length} 张 · 税额 ${fmtMoney(
                      e.invoices.reduce((s, i) => s + i.tax, 0),
                      0,
                    )}`
                  )}
                </span>
                <span
                  className={`tag ${
                    e.status === "done" && e.confidence !== "structured" && e.confidence !== "sheet"
                      ? "tag--ink"
                      : ""
                  }`}
                >
                  {e.status === "parsing"
                    ? "解析中"
                    : e.status === "error"
                      ? "失败"
                      : TAG_LABEL[e.confidence ?? "sheet"] ?? "就绪"}
                </span>
              </div>

              {e.text && e.text.trim().length > 0 && (
                <details className="queue__detail">
                  <summary className="micro">查看识别到的文字（判断是否为版式问题）</summary>
                  <pre className="queue__pre">{e.text.slice(0, 900)}</pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}

      {notes.length > 0 && (
        <div className="warn-box" style={{ marginTop: 16 }}>
          {notes.slice(0, 6).map((n) => (
            <div key={n}>· {n}</div>
          ))}
          {notes.length > 6 && <div>· 其余 {notes.length - 6} 条提示已省略</div>}
        </div>
      )}

      {errors.length > 0 && (
        <div className="error-box" style={{ marginTop: 16 }}>
          {errors.slice(0, 5).map((e) => (
            <div key={e}>· {e}</div>
          ))}
          {errors.length > 5 && <div>· 其余 {errors.length - 5} 条已省略</div>}
        </div>
      )}

      {mode === "paste" && pasteRows && pasteRows.length > 0 && (
        <div className="warn-box" style={{ marginTop: 16 }}>
          已识别 {pasteRows.length} 张发票，税额合计{" "}
          {fmtMoney(pasteRows.reduce((s, i) => s + i.tax, 0), 0)}。
        </div>
      )}

      <div className="import-foot">
        <span className="micro">
          {importable.length > 0
            ? `待导入 ${importable.length} 张 · 税额 ${fmtMoney(
                importable.reduce((s, i) => s + i.tax, 0),
                0,
              )}${totalRows > 0 ? ` · 共扫描 ${totalRows} 行` : ""}`
            : "尚未选择文件"}
        </span>
        <div className="row" style={{ gap: 12 }}>
          {entries.length > 0 && (
            <button className="btn--text" onClick={() => setEntries([])}>
              清空队列
            </button>
          )}
          <button
            className="btn btn--primary"
            disabled={importable.length === 0}
            onClick={() => confirmImport(importable)}
          >
            导入 {importable.length > 0 ? `${importable.length} 张` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
