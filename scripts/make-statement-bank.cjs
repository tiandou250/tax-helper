/**
 * 生成「财务报表样本集」：利润表 / 资产负债表（左右两栏）/ 现金流量表，
 * 覆盖 CSV、无表头的「科目：金额」文本、以及多工作表 xlsx。
 *
 * 用法：node scripts/make-statement-bank.cjs
 * 产物：D:/file/temp/statements/*  + expected.json
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const OUT = "D:/file/temp/statements";
fs.mkdirSync(OUT, { recursive: true });

const PROFIT_ROWS = [
  ["利润表"],
  ["编制单位：南京数联智能科技有限公司", "", "", "2026年10月31日", "", "单位：元"],
  ["项目", "行次", "本期金额", "上期金额"],
  ["一、营业总收入", 1, "1,200,000.00", "900,000.00"],
  ["其中：营业收入", 2, "1,200,000.00", "900,000.00"],
  ["减：营业成本", 3, "700,000.00", "540,000.00"],
  ["税金及附加", 4, "24,000.00", "18,000.00"],
  ["销售费用", 5, "50,000.00", "40,000.00"],
  ["管理费用", 6, "120,000.00", "100,000.00"],
  ["研发费用", 7, "80,000.00", "60,000.00"],
  ["财务费用", 8, "10,000.00", "8,000.00"],
  ["二、营业利润", 15, "216,000.00", "134,000.00"],
  ["加：营业外收入", 16, "5,000.00", "0.00"],
  ["减：营业外支出", 17, "2,000.00", "1,000.00"],
  ["三、利润总额", 20, "219,000.00", "133,000.00"],
  ["减：所得税费用", 21, "10,950.00", "6,650.00"],
  ["四、净利润", 22, "208,050.00", "126,350.00"],
];

const BALANCE_ROWS = [
  ["资产负债表"],
  ["编制单位：南京数联智能科技有限公司", "", "", "2026年10月31日", "", "", "", "单位：元"],
  ["资产", "行次", "期末余额", "年初余额", "负债和所有者权益", "行次", "期末余额", "年初余额"],
  ["货币资金", 1, "1,500,000.00", "900,000.00", "短期借款", 31, "200,000.00", "100,000.00"],
  ["应收账款", 2, "800,000.00", "600,000.00", "应付账款", 32, "450,000.00", "300,000.00"],
  ["存货", 3, "300,000.00", "200,000.00", "应交税费", 33, "120,000.00", "90,000.00"],
  ["流动资产合计", 10, "2,600,000.00", "1,700,000.00", "流动负债合计", 40, "770,000.00", "490,000.00"],
  ["固定资产", 15, "900,000.00", "850,000.00", "负债合计", 45, "770,000.00", "490,000.00"],
  ["资产总计", 20, "3,500,000.00", "2,550,000.00", "实收资本", 50, "1,000,000.00", "1,000,000.00"],
  ["", "", "", "", "未分配利润", 51, "1,730,000.00", "1,060,000.00"],
  ["", "", "", "", "所有者权益合计", 55, "2,730,000.00", "2,060,000.00"],
  ["", "", "", "", "负债和所有者权益总计", 60, "3,500,000.00", "2,550,000.00"],
];

const CASHFLOW_ROWS = [
  ["现金流量表"],
  ["编制单位：南京数联智能科技有限公司", "", "", "2026年10月", "", "单位：元"],
  ["项目", "行次", "本期金额", "上期金额"],
  ["销售商品、提供劳务收到的现金", 1, "1,356,000.00", "1,017,000.00"],
  ["收到的税费返还", 2, "0.00", "0.00"],
  ["经营活动现金流入小计", 5, "1,356,000.00", "1,017,000.00"],
  ["购买商品、接受劳务支付的现金", 6, "700,000.00", "500,000.00"],
  ["支付给职工以及为职工支付的现金", 7, "300,000.00", "240,000.00"],
  ["支付的各项税费", 8, "96,000.00", "70,000.00"],
  ["经营活动现金流出小计", 10, "1,096,000.00", "810,000.00"],
  ["经营活动产生的现金流量净额", 11, "260,000.00", "207,000.00"],
  ["期末现金及现金等价物余额", 20, "1,500,000.00", "900,000.00"],
];

/** 无表头、单格「科目：金额」的粘贴文本（最常见的手工复制场景） */
const LOOSE_TEXT = `利润表
南京数联智能科技有限公司　2026年10月
营业收入：1,000,000.00
营业成本：600,000.00
税金及附加：20,000.00
销售费用：30,000.00
管理费用：100,000.00
财务费用：8,000.00
利润总额：242,000.00
所得税费用：12,100.00
净利润：229,900.00`;

const toCsv = (rows) =>
  "\uFEFF" +
  rows
    .map((r) =>
      r
        .map((c) => {
          const s = String(c ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");

const MANIFEST = [];

/* 1. 利润表 CSV */
fs.writeFileSync(path.join(OUT, "利润表-标准.csv"), toCsv(PROFIT_ROWS), "utf8");
MANIFEST.push({
  file: "利润表-标准.csv",
  expect: {
    kind: "profit",
    period: "2026-10",
    items: {
      revenue: 1200000,
      cost: 700000,
      taxSurcharge: 24000,
      selling: 50000,
      admin: 120000,
      rd: 80000,
      finance: 10000,
      totalProfit: 219000,
      incomeTaxExpense: 10950,
      netProfit: 208050,
    },
  },
});

/* 2. 资产负债表 CSV（左右两栏） */
fs.writeFileSync(path.join(OUT, "资产负债表-左右两栏.csv"), toCsv(BALANCE_ROWS), "utf8");
MANIFEST.push({
  file: "资产负债表-左右两栏.csv",
  expect: {
    kind: "balance",
    period: "2026-10",
    items: {
      cash: 1500000,
      receivable: 800000,
      inventory: 300000,
      currentAssets: 2600000,
      totalAssets: 3500000,
      shortLoan: 200000,
      payable: 450000,
      taxPayable: 120000,
      totalLiab: 770000,
      capital: 1000000,
      retained: 1730000,
      totalEquity: 2730000,
      totalLiabEquity: 3500000,
    },
  },
});

/* 3. 现金流量表 CSV */
fs.writeFileSync(path.join(OUT, "现金流量表.csv"), toCsv(CASHFLOW_ROWS), "utf8");
MANIFEST.push({
  file: "现金流量表.csv",
  expect: {
    kind: "cashflow",
    period: "2026-10",
    items: {
      salesCash: 1356000,
      cashIn: 1356000,
      taxPaid: 96000,
      cashOut: 1096000,
      operatingNet: 260000,
      endingCash: 1500000,
    },
  },
});

/* 4. 无表头「科目：金额」文本 */
fs.writeFileSync(path.join(OUT, "利润表-无表头.txt"), LOOSE_TEXT, "utf8");
MANIFEST.push({
  file: "利润表-无表头.txt",
  expect: {
    kind: "profit",
    period: "2026-10",
    items: { revenue: 1000000, cost: 600000, totalProfit: 242000, netProfit: 229900 },
  },
});

/* 5. 多工作表 xlsx（三表放一个文件） */
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(PROFIT_ROWS), "利润表");
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(BALANCE_ROWS), "资产负债表");
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(CASHFLOW_ROWS), "现金流量表");
XLSX.writeFile(wb, path.join(OUT, "三表合一.xlsx"));
MANIFEST.push({
  file: "三表合一.xlsx",
  expect: {
    sheets: 3,
    items: { revenue: 1200000, totalAssets: 3500000, operatingNet: 260000 },
  },
});

fs.writeFileSync(path.join(OUT, "expected.json"), JSON.stringify(MANIFEST, null, 2), "utf8");
console.log("生成完成：", fs.readdirSync(OUT).join(" / "));
