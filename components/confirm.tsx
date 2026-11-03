"use client";

import { useState } from "react";

/**
 * 清空数据的二次确认。
 * 提供两档：只清业务数据（发票 + 报表），或连计算参数一起重置。
 */
export function ClearDialog({
  invoiceCount,
  statementCount,
  onClose,
  onClearBusiness,
  onClearAll,
}: {
  invoiceCount: number;
  statementCount: number;
  onClose: () => void;
  onClearBusiness: () => void;
  onClearAll: () => void;
}) {
  const [confirmAll, setConfirmAll] = useState(false);

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 520 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal__head">
          <h3 className="h3">清空数据</h3>
          <button className="close" onClick={onClose}>
            关闭
          </button>
        </div>

        <p className="body muted">
          当前有 {invoiceCount} 张发票、{statementCount} 份财务报表。清空后无法撤销。
        </p>
        <p className="micro" style={{ marginTop: 10 }}>
          本应用不留存数据：内容只保存在当前标签页，关闭标签页即由浏览器清除，不会写入磁盘。
        </p>

        {confirmAll && (
          <div className="error-box" style={{ marginTop: 18 }}>
            将连同计算参数（纳税人身份、税率、期间费用等）一起重置为默认值。
          </div>
        )}

        <div className="modal__actions" style={{ flexWrap: "wrap" }}>
          <button className="btn btn--ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn btn--ghost" onClick={onClearBusiness}>
            清空发票与报表
          </button>
          {confirmAll ? (
            <button
              className="btn btn--primary"
              onClick={onClearAll}
              style={{ background: "#B42318", borderColor: "#B42318" }}
            >
              确认全部重置
            </button>
          ) : (
            <button className="btn btn--ghost" onClick={() => setConfirmAll(true)}>
              连参数一起重置
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
