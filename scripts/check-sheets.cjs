/**
 * 冒烟测试：批量导入 → 期间切换 → 留抵台账 → 导出。
 * 用法：先 pnpm build && pnpm start，再 `node scripts/smoke.cjs`
 */
const { chromium } = require("playwright-core");
const fs = require("fs");
const XLSX = require("xlsx");

const TMP = "D:/file/temp";
const CSV1 = `${TMP}/smoke-a.csv`;
const CSV2 = `${TMP}/smoke-b.csv`;

fs.mkdirSync(TMP, { recursive: true });
fs.writeFileSync(
  CSV1,
  "\uFEFF" +
    [
      "发票类型,发票种类,开票日期,发票号码,对方单位,商品名称,不含税金额,税率,税额,价税合计",
      "销项,专票,2026-10-08,1001,客户甲,软件开发服务,426000,6,25560,451560",
      "销项,专票,2026-10-14,1002,客户乙,智能硬件销售,618000,13,80340,698340",
      "进项,专票,2026-10-03,1003,供应商甲,服务器采购,462000,13,60060,522060",
      "进项,普票,2026-10-22,1004,供应商乙,办公用品,7400,13,962,8362",
    ].join("\n"),
  "utf8",
);
fs.writeFileSync(
  CSV2,
  "\uFEFF" +
    [
      "发票类型,发票种类,开票日期,发票号码,对方单位,商品名称,不含税金额,税率,税额,价税合计",
      "进项,专票,2026-11-05,2001,大额设备供应商,设备采购,900000,13,117000,1017000",
      "销项,专票,2026-11-20,2002,小客户,技术服务费,100000,6,6000,106000",
    ].join("\n"),
  "utf8",
);

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !m.text().includes("favicon") && errors.push(m.text()));

  await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(700);

  await page.locator('input[type="file"]').setInputFiles([CSV1, CSV2]);
  await page.waitForTimeout(1400);
  console.log("队列文件数:", await page.locator(".queue__row").count());
  console.log("待导入:", (await page.locator(".import-foot .micro").innerText()).trim());

  await page.locator(".import-foot .btn--primary").click();
  await page.waitForTimeout(1500);
  console.log("期间:", (await page.locator("#overview .section__head .sub").innerText()).trim());
  console.log("KPI:", await page.$$eval("#overview .grid--4 .kpi__value", (els) => els.map((e) => e.textContent.trim())));

  const ledger = await page.$$eval(".table--tax tbody tr", (rows) =>
    rows.map((r) => r.innerText.replace(/\s+/g, " ")),
  );
  console.log("留抵台账:", ledger.slice(-2));

  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出申报底稿" }).click();
  const download = await dl;
  const file = `${TMP}/${download.suggestedFilename()}`;
  await download.saveAs(file);
  const wb = XLSX.readFile(file);
  console.log("工作簿:", wb.SheetNames.join(" / "));

  const csvDl = page.waitForEvent("download");
  await page.locator("#summary .btn--text").first().click();
  console.log("CSV:", (await csvDl).suggestedFilename());

  console.log("运行时错误:", errors);
  await browser.close();
})();
