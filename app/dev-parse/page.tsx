"use client";

import { useState } from "react";
import { parseDoc } from "@/lib/doc-parse";
import { buildInvoice } from "@/lib/doc-parse";
import { parseFiles } from "@/lib/parse";
import { parseStatementFile, summarizeProfit, detectKind, detectPeriod } from "@/lib/statement";

interface Row {
  name: string;
  size: number;
  ok: boolean;
  fields: unknown;
  confidence: string;
  warnings: string[];
  errors: string[];
  text: string;
  invoice: unknown;
  ms: number;
}

export default function DevParse() {
  const [rows, setRows] = useState<Row[]>([]);
  const [stmt, setStmt] = useState<unknown[]>([]);
  const [busy, setBusy] = useState(false);

  const run = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const out: Row[] = [];
    for (const file of Array.from(files)) {
      const t0 = performance.now();
      try {
        const res = await parseDoc(file);
        const inv = res.fields ? buildInvoice(res.fields, "南京数联智能科技有限公司").invoice : null;
        out.push({
          name: file.name,
          size: file.size,
          ok: Boolean(res.fields),
          fields: res.fields,
          confidence: res.confidence,
          warnings: res.warnings,
          errors: res.errors,
          text: (res.text ?? "").slice(0, 1200),
          invoice: inv,
          ms: Math.round(performance.now() - t0),
        });
      } catch (err) {
        out.push({
          name: file.name,
          size: file.size,
          ok: false,
          fields: null,
          confidence: "-",
          warnings: [],
          errors: [`EXCEPTION ${(err as Error)?.message}`],
          text: "",
          invoice: null,
          ms: Math.round(performance.now() - t0),
        });
      }
    }
    setRows(out);
    (window as unknown as { __PARSE: Row[] }).__PARSE = out;
    setBusy(false);
  };

  const runSheet = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const res = await parseFiles(Array.from(files));
    const rows2: Row[] = res.map((r) => ({
      name: r.name,
      size: r.size,
      ok: r.invoices.length > 0,
      fields: r.invoices[0] ?? null,
      confidence: String(r.confidence ?? "-"),
      warnings: r.warnings,
      errors: r.errors,
      text: "",
      invoice: r.invoices[0] ?? null,
      ms: 0,
    }));
    setRows(rows2);
    (window as unknown as { __PARSE: Row[] }).__PARSE = rows2;
    setBusy(false);
  };

  /** 财务报表解析（内部自查用） */
  const runStatement = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const out: unknown[] = [];
    for (const file of Array.from(files)) {
      const docs = await parseStatementFile(file);
      for (const d of docs) {
        out.push({
          file: file.name,
          kind: d.kind,
          period: d.period,
          itemCount: Object.keys(d.items).length,
          variant: d.variantLabel,
          variants: (d.variants ?? []).map((v) => v.label),
          items: d.items,
          profit: d.kind === "profit" ? summarizeProfit(d) : undefined,
          warnings: d.warnings,
          unmatched: d.unmatched,
        });
      }
      if (docs.length === 0) {
        const text = await file.text().catch(() => "");
        out.push({
          file: file.name,
          kind: detectKind(text) ?? null,
          period: detectPeriod(text),
          error: "未识别为三表之一",
        });
      }
    }
    (window as unknown as { __STMT: unknown[] }).__STMT = out;
    setStmt(out);
    setBusy(false);
  };

  return (
    <div style={{ padding: 24, fontFamily: "monospace", fontSize: 12 }}>
      <h1 style={{ fontSize: 16 }}>解析调试（内部页）</h1>
      <div style={{ marginBottom: 8 }}>
        发票：<input type="file" multiple onChange={(e) => run(e.target.files)} />{" "}
        <input type="file" multiple onChange={(e) => runSheet(e.target.files)} />
      </div>
      <div>
        报表：<input type="file" multiple onChange={(e) => runStatement(e.target.files)} />
      </div>
      <span style={{ marginLeft: 12, color: "#6E6E73" }}>{busy ? "解析中…" : `发票 ${rows.length} 份 · 报表 ${stmt.length} 份`}</span>
      {stmt.length > 0 && (
        <pre style={{ whiteSpace: "pre-wrap", background: "#f6f6f8", padding: 12 }}>
          {JSON.stringify(stmt, null, 1)}
        </pre>
      )}
      <div style={{ marginTop: 16 }}>
        {rows.map((r) => (
          <details key={r.name} style={{ borderBottom: "1px solid #ddd", padding: "8px 0" }}>
            <summary style={{ cursor: "pointer" }}>
              {r.ok ? "OK  " : "FAIL"} {r.name} · {r.confidence} · {r.ms}ms
              {r.errors.length > 0 && ` · ${r.errors[0]}`}
            </summary>
            <pre style={{ whiteSpace: "pre-wrap", margin: "8px 0 0" }}>
              {JSON.stringify({ fields: r.fields, invoice: r.invoice, warnings: r.warnings, errors: r.errors }, null, 1)}
            </pre>
            <pre style={{ whiteSpace: "pre-wrap", color: "#666", maxHeight: 240, overflow: "auto" }}>
              {r.text}
            </pre>
          </details>
        ))}
      </div>
    </div>
  );
}
