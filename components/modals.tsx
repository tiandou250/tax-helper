"use client";

import { useMemo, useState } from "react";
import type { Invoice } from "@/lib/types";
import { completeInvoice, RATE_OPTIONS } from "@/lib/types";
import { fmtMoney } from "@/lib/format";

export function InvoiceModal({
  initial,
  onClose,
  onSave,
  categories = [],
}: {
  initial?: Invoice;
  onClose: () => void;
  onSave: (invoice: Invoice) => void;
  /** 已有项目名，供输入时补全，避免同名不同写法 */
  categories?: string[];
}) {
  const [direction, setDirection] = useState<"input" | "output">(initial?.direction ?? "output");
  const [kind, setKind] = useState<"special" | "ordinary">(initial?.kind ?? "special");
  const [checked, setChecked] = useState(initial?.checked ?? true);
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().slice(0, 10));
  const [number, setNumber] = useState(initial?.number ?? "");
  const [counterparty, setCounterparty] = useState(initial?.counterparty ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  // 只有税额为 0 的（例如二维码识别出的）默认按价税合计录入
  const [entryMode, setEntryMode] = useState<"amount" | "total">(
    initial && initial.rate === 0 && initial.total > 0 && Math.abs(initial.total - initial.amount) < 0.005
      ? "total"
      : "amount",
  );
  const [value, setValue] = useState(
    initial
      ? String(initial.rate === 0 && Math.abs(initial.total - initial.amount) < 0.005 ? initial.total : initial.amount)
      : "",
  );
  const [rate, setRate] = useState<number>(initial?.rate ?? 6);

  const preview = useMemo(() => {
    const v = Number(value);
    if (!isFinite(v) || v <= 0) return { amount: 0, tax: 0, total: 0 };
    const r = rate / 100;
    const amount = entryMode === "amount" ? v : v / (1 + r);
    const tax = amount * r;
    return {
      amount: Math.round(amount * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      total: Math.round((amount + tax) * 100) / 100,
    };
  }, [value, rate, entryMode]);

  const valid = Number(value) > 0 && date.length === 10;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3 className="h3">{initial ? "编辑发票" : "新增发票"}</h3>
          <button className="close" onClick={onClose}>
            关闭
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="row" style={{ gap: 20, flexWrap: "wrap" }}>
            <div className="field">
              <span className="field__label">进销项</span>
              <div className="seg">
                <button
                  className={`seg__item ${direction === "output" ? "is-active" : ""}`}
                  onClick={() => setDirection("output")}
                >
                  销项
                </button>
                <button
                  className={`seg__item ${direction === "input" ? "is-active" : ""}`}
                  onClick={() => setDirection("input")}
                >
                  进项
                </button>
              </div>
            </div>
            <div className="field">
              <span className="field__label">票种</span>
              <div className="seg">
                <button
                  className={`seg__item ${kind === "special" ? "is-active" : ""}`}
                  onClick={() => setKind("special")}
                >
                  专票
                </button>
                <button
                  className={`seg__item ${kind === "ordinary" ? "is-active" : ""}`}
                  onClick={() => setKind("ordinary")}
                >
                  普票
                </button>
              </div>
            </div>
          </div>

          <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
            <label className="field" style={{ flex: 1, minWidth: 180 }}>
              <span className="field__label">开票日期</span>
              <input
                className="input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label className="field" style={{ flex: 1, minWidth: 180 }}>
              <span className="field__label">发票号码</span>
              <input
                className="input"
                value={number}
                placeholder="选填"
                onChange={(e) => setNumber(e.target.value)}
              />
            </label>
          </div>

          <label className="field">
            <span className="field__label">
              {direction === "output" ? "购买方" : "销售方"}名称
            </span>
            <input
              className="input"
              value={counterparty}
              placeholder="对方单位名称"
              onChange={(e) => setCounterparty(e.target.value)}
            />
          </label>

          <label className="field">
            <span className="field__label">发票项目 / 商品服务</span>
            <input
              className="input"
              value={category}
              list="project-options"
              placeholder="如：软件开发服务、货物运输服务"
              onChange={(e) => setCategory(e.target.value)}
            />
            <datalist id="project-options">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>

          <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
            <label className="field" style={{ flex: 1, minWidth: 180 }}>
              <span className="field__label">
                {entryMode === "amount" ? "不含税金额" : "价税合计"}
              </span>
              <input
                className="input input--num"
                inputMode="decimal"
                value={value}
                placeholder="0.00"
                onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))}
              />
            </label>
            <label className="field" style={{ flex: 1, minWidth: 180 }}>
              <span className="field__label">税率</span>
              <select className="select" value={rate} onChange={(e) => setRate(Number(e.target.value))}>
                {RATE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}%
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="seg" style={{ alignSelf: "flex-start" }}>
            <button
              className={`seg__item ${entryMode === "amount" ? "is-active" : ""}`}
              onClick={() => setEntryMode("amount")}
            >
              按不含税金额
            </button>
            <button
              className={`seg__item ${entryMode === "total" ? "is-active" : ""}`}
              onClick={() => setEntryMode("total")}
            >
              按价税合计
            </button>
          </div>

          {direction === "input" && (
            <div className="field">
              <span className="field__label">进项勾选</span>
              <button
                className={`switch ${checked && kind === "special" ? "is-on" : ""}`}
                onClick={() => kind === "special" && setChecked((v) => !v)}
                style={{ height: 28, opacity: kind === "special" ? 1 : 0.45 }}
              >
                <span className="switch__track" />
                <span className="body">
                  {kind === "special" ? (checked ? "已勾选抵扣" : "未勾选") : "普票不可抵扣"}
                </span>
              </button>
            </div>
          )}

          <div className="card card--outline" style={{ padding: 18 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="body muted">税额</span>
              <span className="body num">{fmtMoney(preview.tax)}</span>
            </div>
            <div className="row" style={{ justifyContent: "space-between", marginTop: 10 }}>
              <span className="body muted">
                {entryMode === "amount" ? "价税合计" : "不含税金额"}
              </span>
              <span className="body num">
                {fmtMoney(entryMode === "amount" ? preview.total : preview.amount)}
              </span>
            </div>
          </div>
        </div>

        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={onClose}>
            取消
          </button>
          <button
            className="btn btn--primary"
            disabled={!valid}
            onClick={() =>
              onSave(
                completeInvoice({
                  id: initial?.id,
                  direction,
                  kind,
                  date,
                  number,
                  counterparty,
                  category: category || "未分类",
                  amount: preview.amount,
                  rate,
                  checked: direction === "input" && kind === "special" ? checked : kind === "special",
                  note: initial?.note,
                }),
              )
            }
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
