const { chromium } = require("playwright-core");
const DIR = "D:/file/temp/fixtures";
(async () => {
  const b = await chromium.launch({ channel: "msedge", headless: true, args: ["--no-sandbox"] });
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  await p.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  await p.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("piaoshui.settings.v2", JSON.stringify({ companyName: "南京数联智能科技有限公司" }));
  });
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(700);
  await p.locator('input[type="file"]').setInputFiles([
    `${DIR}/sample-数电票.xml`, `${DIR}/sample-电子发票.ofd`, `${DIR}/sample-电子发票.pdf`,
    `${DIR}/sample-真实版式.pdf`, `${DIR}/sample-图像版.pdf`,
  ]);
  await p.waitForTimeout(8000);
  console.log("队列:");
  (await p.$$eval(".queue__item", (els) => els.map((e) => e.innerText.replace(/\s+/g, " ").slice(0, 150)))).forEach((r) => console.log("  " + r));
  console.log("提示:");
  (await p.$$eval(".warn-box div", (els) => els.map((e) => e.innerText))).forEach((r) => console.log("  " + r));
  await p.screenshot({ path: "D:/file/temp/proj-queue.png" });

  await p.locator(".import-foot .btn--primary").click();
  await p.waitForTimeout(1600);

  // 明细页：项目下拉
  await p.locator("#invoices").scrollIntoViewIfNeeded();
  await p.waitForTimeout(800);
  const opts = await p.$$eval(".toolbar__project option", (els) => els.map((e) => e.textContent));
  console.log("项目下拉:", opts);
  await p.selectOption(".toolbar__project", "数据服务费");
  await p.waitForTimeout(700);
  console.log("项目汇总条:", (await p.locator(".project-bar").innerText()).replace(/\s+/g, " "));
  console.log("筛选后行数:", await p.locator(".table--invoices tbody tr").count());
  await p.screenshot({ path: "D:/file/temp/proj-filter.png" });

  // 分类汇总点击跳转
  await p.evaluate(() => { document.querySelector(".toolbar__project").value = ""; });
  await p.locator("#summary").scrollIntoViewIfNeeded();
  await p.waitForTimeout(600);
  const cat = await p.$$eval("#summary .meter-row .body", (els) => els.map((e) => e.textContent));
  console.log("分类卡片项目:", cat.slice(0, 5));
  await b.close();
})();
