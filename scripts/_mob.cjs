const { chromium } = require("playwright-core");
const DIR = "D:/file/temp/fixtures";
(async () => {
  const b = await chromium.launch({ channel: "msedge", headless: true, args: ["--no-sandbox"] });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await p.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  await p.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("piaoshui.settings.v2", JSON.stringify({ companyName: "南京数联智能科技有限公司" }));
  });
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(700);
  await p.locator('input[type="file"]').setInputFiles([`${DIR}/sample-真实版式.pdf`, `${DIR}/sample-图像版.pdf`]);
  await p.waitForTimeout(8000);
  await p.evaluate(() => document.querySelector(".queue__detail")?.setAttribute("open", ""));
  await p.waitForTimeout(400);
  await p.screenshot({ path: "D:/file/temp/m-queue.png" });
  await p.locator(".import-foot .btn--primary").click();
  await p.waitForTimeout(1500);
  await p.evaluate(() => window.scrollTo(0, document.querySelector("#invoices").offsetTop - 10));
  await p.waitForTimeout(800);
  await p.screenshot({ path: "D:/file/temp/m-inv.png" });
  await b.close();
  console.log("ok");
})();
