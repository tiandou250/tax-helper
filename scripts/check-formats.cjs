/**
 * 版式发票识别回归：XML / OFD / PDF / PNG 四种格式。
 * 先跑 node scripts/make-fixtures.cjs 生成样本，再启动服务后执行本脚本。
 */
const { chromium } = require("playwright-core");

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

  await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem(
      "piaoshui.ss.settings",
      JSON.stringify({ companyName: "南京数联智能科技有限公司" }),
    );
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(700);

  await page.locator('#import input[type="file"]').setInputFiles(FILES);
  await page.waitForTimeout(6000);

  const rows = await page.$$eval(".queue__row", (els) =>
    els.map((e) => e.innerText.replace(/\s+/g, " ")),
  );
  console.log("队列:");
  rows.forEach((r) => console.log("  " + r));
  const notes = await page.$$eval(".warn-box div", (els) => els.map((e) => e.innerText));
  console.log("提示:", notes);

  await page.locator(".import-foot .btn--primary").click();
  await page.waitForTimeout(1500);
  const data = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem("piaoshui.ss.invoices")) || [],
  );
  console.log("入库:");
  data.forEach((i) =>
    console.log(
      `  ${i.date} ${i.direction} ${i.kind} ${i.counterparty || "(空)"} ${i.category} amt=${i.amount} rate=${i.rate} tax=${i.tax} total=${i.total}`,
    ),
  );
  console.log("运行时错误:", errors);
  await browser.close();
})();
