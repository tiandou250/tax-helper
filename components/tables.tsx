"use client";

import type { Invoice } from "@/lib/types";
import type { TaxLine } from "@/lib/tax";
import { directionLabel, fmtDate, fmtNumber, kindLabel } from "@/lib/format";

export function InvoiceTable({
  invoices,
  onToggle,
  onEdit,
  onRemove,
}: {
  invoices: Invoice[];
  onToggle: (id: string) => void;
  onEdit: (invoice: Invoice) => void;
  onRemove: (id: string) => void;
}) {
  if (invoices.length === 0) {
    return <div className="empty">没有符合条件的发票</div>;
  }

  return (
    <>
      <div className="table-scroll invoice-scroll">
        <table className="table table--invoices">
          <thead>
            <tr>
              <th className="nowrap">开票日期</th>
              <th>往来单位 / 商品服务</th>
              <th className="r">不含税金额</th>
              <th className="r">税率</th>
              <th className="r">税额</th>
              <th>类型</th>
              <th>进项勾选</th>
              <th className="r">操作</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv, idx) => (
              <tr
                key={inv.id}
                className="row-in"
                style={{ animationDelay: `${Math.min(idx, 12) * 28}ms` }}
              >
                <td className="nowrap num">{fmtDate(inv.date)}</td>
                <td>
                  <div className="cell-strong ellipsis" title={inv.counterparty}>
                    {inv.counterparty || "—"}
                  </div>
                  <div className="micro ellipsis" title={inv.category}>
                    {inv.category}
                  </div>
                </td>
                <td className="r">{fmtNumber(inv.amount)}</td>
                <td className="r">{inv.rate}%</td>
                <td className="r">{fmtNumber(inv.tax)}</td>
                <td className="nowrap">
                  <span className={`tag ${inv.direction === "output" ? "tag--ink" : ""}`}>
                    {directionLabel(inv.direction)} · {kindLabel(inv.kind)}
                  </span>
                </td>
                <td className="nowrap">
                  {inv.direction === "output" ? (
                    <span className="micro">—</span>
                  ) : inv.kind === "ordinary" ? (
                    <span className="micro" title="普通发票进项税额不得抵扣">
                      不可抵扣
                    </span>
                  ) : (
                    <button
                      className={`btn--text ${inv.checked ? "is-on" : ""}`}
                      onClick={() => onToggle(inv.id)}
                      title="点击切换是否已勾选抵扣"
                      style={{ fontSize: 13 }}
                    >
                      {inv.checked ? "已勾选" : "未勾选"}
                    </button>
                  )}
                </td>
                <td className="r nowrap">
                  <button className="btn--text" onClick={() => onEdit(inv)} style={{ fontSize: 13 }}>
                    编辑
                  </button>
                  <button
                    className="btn--text"
                    onClick={() => onRemove(inv.id)}
                    style={{ fontSize: 13, marginLeft: 12 }}
                  >
                    移除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="invoice-cards">
        {invoices.map((inv, idx) => (
          <div
            className="invoice-card row-in"
            key={inv.id}
            style={{ animationDelay: `${Math.min(idx, 12) * 28}ms` }}
          >
            <div className="invoice-card__top">
              <span className="num muted">{fmtDate(inv.date)}</span>
              <span className="num" style={{ fontWeight: 600 }}>
                {fmtNumber(inv.amount)}
              </span>
            </div>
            <div className="invoice-card__name cell-strong">{inv.counterparty || "—"}</div>
            <div className="invoice-card__foot">
              <span className={`tag ${inv.direction === "output" ? "tag--ink" : ""}`}>
                {directionLabel(inv.direction)} · {kindLabel(inv.kind)}
              </span>
              <span className="ellipsis" style={{ maxWidth: 150 }}>
                {inv.category}
              </span>
              <span className="num">
                {inv.rate}% · 税 {fmtNumber(inv.tax)}
              </span>
            </div>
            <div className="invoice-card__acts">
              {inv.direction === "input" &&
                (inv.kind === "ordinary" ? (
                  <span className="micro">不可抵扣</span>
                ) : (
                  <button
                    className={`btn--text ${inv.checked ? "is-on" : ""}`}
                    onClick={() => onToggle(inv.id)}
                    style={{ fontSize: 13 }}
                  >
                    {inv.checked ? "已勾选" : "未勾选"}
                  </button>
                ))}
              <button
                className="btn--text"
                onClick={() => onEdit(inv)}
                style={{ fontSize: 13 }}
              >
                编辑
              </button>
              <button
                className="btn--text"
                onClick={() => onRemove(inv.id)}
                style={{ fontSize: 13 }}
              >
                移除
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function TaxTable({ lines }: { lines: TaxLine[] }) {
  const total = lines.reduce((s, l) => s + l.amount, 0);

  return (
    <>
      <div className="table-scroll table-scroll--x tax-scroll">
        <table className="table table--tax">
          <thead>
            <tr>
              <th>税种 / 计税依据</th>
              <th className="r">计税基数</th>
              <th className="r">税率</th>
              <th className="r">税额</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key}>
                <td>
                  <div className="cell-strong">{l.name}</div>
                  <div className="micro">
                    {l.basis}
                    {l.hint ? ` · ${l.hint}` : ""}
                  </div>
                </td>
                <td className="r">{fmtNumber(l.base)}</td>
                <td className="r nowrap">{l.rateLabel}</td>
                <td className="r cell-strong">{fmtNumber(l.amount)}</td>
              </tr>
            ))}
            <tr className="table__total">
              <td className="cell-strong">合计</td>
              <td className="r">—</td>
              <td className="r">—</td>
              <td className="r cell-strong">{fmtNumber(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="tax-cards">
        {lines.map((l) => (
          <div className="tax-card" key={l.key}>
            <div className="tax-card__top">
              <span className="cell-strong">{l.name}</span>
              <span className="num" style={{ fontWeight: 600 }}>
                {fmtNumber(l.amount)}
              </span>
            </div>
            <div className="micro" style={{ marginTop: 6 }}>
              {l.basis}
              {l.hint ? ` · ${l.hint}` : ""}
            </div>
            <div className="micro" style={{ marginTop: 6 }}>
              计税基数 {fmtNumber(l.base)} · 税率 {l.rateLabel}
            </div>
          </div>
        ))}
        <div className="tax-card tax-card--total">
          <div className="tax-card__top">
            <span className="cell-strong">合计</span>
            <span className="num" style={{ fontWeight: 600 }}>
              {fmtNumber(total)}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
