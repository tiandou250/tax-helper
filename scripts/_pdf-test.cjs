const { chromium } = require("playwright-core");
const DIR = "D:/file/temp/fixtures";
(async () => {
  const b = await chromium.launch({ channel: "msedge", headless: true, args: ["--no-sandbox"] });
  const p = await b.newPage({ viewport: { width: 1440, height: 1100 } });
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => { if (m.text().includes("[qr-debug]")) console.log(m.text()); });
  await p.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  await p.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("piaoshui.settings.v2", JSON.stringify({ companyName: "南京数联智能科技有限公司" }));
  });
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(800);
  await p.locator('input[type="file"]').setInputFiles([
    `${DIR}/sample-真实版式.pdf`,
    `${DIR}/sample-图像版.pdf`,
  ]);
  await p.waitForTimeout(8000);
  const rows = await p.$$eval(".queue__item", (els) => els.map((e) => e.innerText.replace(/\s+/g, " ").slice(0, 200)));
  rows.forEach((r) => console.log("· " + r));
  await p.screenshot({ path: "D:/file/temp/pdf-test.png", fullPage: false });
  await p.locator(".import-foot .btn--primary").click();
  await p.waitForTimeout(1500);
  const data = await p.evaluate(() => JSON.parse(localStorage.getItem("piaoshui.invoices.v2")) || []);
  data.forEach((i) => console.log(`入库 ${i.date} ${i.direction} ${i.counterparty} [${i.category}] ${i.amount}/${i.rate}% 税${i.tax} 总${i.total}`));
  console.log("错误:", errs);
  await b.close();
})();
