"use client";

import type { TaxSettings } from "@/lib/types";

type Patch = (patch: Partial<TaxSettings>) => void;

export function SettingsPanel({
  settings,
  onChange,
}: {
  settings: TaxSettings;
  onChange: Patch;
}) {
  const general = settings.taxpayer === "general";

  return (
    <div className="grid grid--2" style={{ gap: 24 }}>
      <label className="field" style={{ gridColumn: "1 / -1" }}>
        <span className="field__label">本单位全称</span>
        <input
          className="input"
          value={settings.companyName}
          placeholder="例如：南京数联智能科技有限公司（用于自动判断进项 / 销项）"
          onChange={(e) => onChange({ companyName: e.target.value })}
        />
      </label>

      <div className="field">
        <span className="field__label">纳税人身份</span>
        <div className="seg">
          <button
            className={`seg__item ${general ? "is-active" : ""}`}
            onClick={() => onChange({ taxpayer: "general" })}
          >
            一般纳税人
          </button>
          <button
            className={`seg__item ${!general ? "is-active" : ""}`}
            onClick={() => onChange({ taxpayer: "small" })}
          >
            小规模纳税人
          </button>
        </div>
      </div>

      <div className="field">
        <span className="field__label">城市维护建设税税率</span>
        <div className="seg">
          {[
            { v: 7, l: "市区 7%" },
            { v: 5, l: "县城镇 5%" },
            { v: 1, l: "其他 1%" },
          ].map((o) => (
            <button
              key={o.v}
              className={`seg__item ${settings.cityRate === o.v ? "is-active" : ""}`}
              onClick={() => onChange({ cityRate: o.v })}
            >
              {o.l}
            </button>
          ))}
        </div>
      </div>

      {general ? (
        <label className="field">
          <span className="field__label">期初留抵税额</span>
          <input
            className="input input--num"
            inputMode="decimal"
            value={settings.openingCredit}
            onChange={(e) =>
              onChange({ openingCredit: Math.max(0, Number(e.target.value.replace(/[^\d.]/g, "")) || 0) })
            }
          />
        </label>
      ) : (
        <div className="field">
          <span className="field__label">征收率</span>
          <div className="seg">
            <button
              className={`seg__item ${settings.smallRate === 1 ? "is-active" : ""}`}
              onClick={() => onChange({ smallRate: 1 })}
            >
              1%（优惠）
            </button>
            <button
              className={`seg__item ${settings.smallRate === 3 ? "is-active" : ""}`}
              onClick={() => onChange({ smallRate: 3 })}
            >
              3% 法定
            </button>
          </div>
        </div>
      )}

      <label className="field">
        <span className="field__label">期间费用（月，用于所得税估算）</span>
        <input
          className="input input--num"
          inputMode="decimal"
          value={settings.expenses}
          onChange={(e) =>
            onChange({ expenses: Math.max(0, Number(e.target.value.replace(/[^\d.]/g, "")) || 0) })
          }
        />
      </label>

      <label className="field">
        <span className="field__label">企业所得税税率</span>
        <select
          className="select"
          value={settings.incomeTaxRate}
          onChange={(e) => onChange({ incomeTaxRate: Number(e.target.value) })}
        >
          <option value={5}>5%（小型微利企业）</option>
          <option value={25}>25%（法定税率）</option>
          <option value={20}>20%（高新技术企业以外优惠）</option>
          <option value={15}>15%（高新技术企业）</option>
        </select>
      </label>

      <div className="field">
        <span className="field__label">印花税税率（买卖合同）</span>
        <input
          className="input input--num"
          inputMode="decimal"
          value={settings.stampRate}
          onChange={(e) =>
            onChange({ stampRate: Math.max(0, Number(e.target.value.replace(/[^\d.]/g, "")) || 0) })
          }
        />
      </div>

      <div className="field">
        <span className="field__label">其他税费（房产税、土地使用税等）</span>
        <input
          className="input input--num"
          inputMode="decimal"
          placeholder="0"
          value={settings.otherTaxes}
          onChange={(e) =>
            onChange({ otherTaxes: Math.max(0, Number(e.target.value.replace(/[^\d.]/g, "")) || 0) })
          }
        />
      </div>

      <div className="field">
        <span className="field__label">小型微利企业</span>
        <button
          className={`switch ${settings.smallBusiness ? "is-on" : ""}`}
          onClick={() => onChange({ smallBusiness: !settings.smallBusiness })}
          style={{ height: 28 }}
        >
          <span className="switch__track" />
          <span className="body">{settings.smallBusiness ? "已适用（六税两费减半）" : "未适用"}</span>
        </button>
      </div>

      {!general && (
        <div className="field">
          <span className="field__label">月销售额 10 万元以下免征增值税</span>
          <button
            className={`switch ${settings.vatExemption ? "is-on" : ""}`}
            onClick={() => onChange({ vatExemption: !settings.vatExemption })}
            style={{ height: 28 }}
          >
            <span className="switch__track" />
            <span className="body">{settings.vatExemption ? "已开启" : "已关闭"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
