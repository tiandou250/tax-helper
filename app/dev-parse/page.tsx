"use client";

import { useState } from "react";
import { parseDoc } from "@/lib/doc-parse";
import { buildInvoice } from "@/lib/doc-parse";
import { parseFiles } from "@/lib/parse";

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

  return (
    <div style={{ padding: 24, fontFamily: "monospace", fontSize: 12 }}>
      <h1 style={{ fontSize: 16 }}>解析调试（内部页）</h1>
      <input type="file" multiple onChange={(e) => run(e.target.files)} />
      {" "}
      <input type="file" multiple onChange={(e) => runSheet(e.target.files)} />
      <span style={{ marginLeft: 12, color: "#6E6E73" }}>{busy ? "解析中…" : `共 ${rows.length} 份`}</span>
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
