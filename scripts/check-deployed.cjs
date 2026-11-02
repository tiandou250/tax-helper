/**
 * 对已部署（或本地静态预览）的站点做端到端验证。
 * 用法：node scripts/check-deployed.cjs http://localhost:4000/tax-helper/
 */
const { chromium } = require("playwright-core");

const BASE = (process.argv[2] || "http://localhost:4000/tax-helper/").replace(/\/?$/, "/");
const DIR = "D:/file/temp/fixtures";
const FILES = [
  `${DIR}/sample-数电票.xml`,
  `${DIR}/sample-电子发票.ofd`,
  `${DIR}/sample-电子发票.pdf`,
  `${DIR}/sample-发票照片.png`,
];

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
  page.on("console", (m) => m.type() === "error" && !m.text().includes("favicon") && errors.push(m.text()));
  page.on("requestfailed", (r) => errors.push(`REQFAIL ${r.url()} ${r.failure()?.errorText}`));

  console.log("打开:", BASE);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem(
      "piaoshui.settings.v2",
      JSON.stringify({ companyName: "南京数联智能科技有限公司" }),
    );
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  console.log("标题:", await page.title());

  await page.locator('input[type="file"]').setInputFiles(FILES);
  await page.waitForTimeout(7000);

  const rows = await page.$$eval(".queue__row", (els) => els.map((e) => e.innerText.replace(/\s+/g, " ")));
  console.log("队列:");
  rows.forEach((r) => console.log("  " + r));

  await page.screenshot({ path: "D:/file/temp/deploy-queue.png" });
  await page.locator(".import-foot .btn--primary").click();
  await page.waitForTimeout(1600);
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem("piaoshui.invoices.v2")) || []);
  console.log("入库条数:", data.length);
  data.forEach((i) => console.log(`  ${i.date} ${i.counterparty || "(空)"} ${i.amount} / ${i.rate}%`));

  await page.evaluate(() => window.scrollTo(0, document.querySelector("#overview").offsetTop - 40));
  await page.waitForTimeout(900);
  await page.screenshot({ path: "D:/file/temp/deploy-overview.png" });

  console.log("错误:", errors.length ? errors : "无");
  await browser.close();
})();
