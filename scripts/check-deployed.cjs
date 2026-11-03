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
  `${DIR}/sample-真实版式.pdf`,
  `${DIR}/sample-图像版.pdf`,
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
  await page.locator('#import input[type="file"]').waitFor({ state: "attached", timeout: 60000 });
  await page.waitForTimeout(1200);
  console.log("标题:", await page.title());

  await page.locator('#import input[type="file"]').setInputFiles(FILES);
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

  // 按项目筛选
  await page.locator("#invoices").scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  const opts = await page.$$eval(".toolbar__project option", (els) => els.map((e) => e.textContent));
  console.log("项目下拉:", opts.join(" / "));
  if (opts.length > 1) {
    await page.selectOption(".toolbar__project", opts[1]);
    await page.waitForTimeout(600);
    console.log("项目汇总:", (await page.locator(".project-bar").innerText()).replace(/\s+/g, " "));
    await page.screenshot({ path: "D:/file/temp/deploy-project.png" });
    await page.selectOption(".toolbar__project", "");
  }

  await page.evaluate(() => window.scrollTo(0, document.querySelector("#overview").offsetTop - 40));
  await page.waitForTimeout(900);
  await page.screenshot({ path: "D:/file/temp/deploy-overview.png" });

  console.log("错误:", errors.length ? errors : "无");
  await browser.close();
})();
