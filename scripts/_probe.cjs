const { chromium } = require("playwright-core");
(async () => {
  const b = await chromium.launch({ channel: "msedge", headless: true, args: ["--no-sandbox"] });
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  const bad = [];
  p.on("response", (r) => { if (r.status() >= 400) bad.push(`HTTP ${r.status()} ${r.url().slice(0, 110)}`); });
  await p.goto("https://tax-helper-16381.app.workbuddy.host/?sharecode=TUWF4VDFCA", { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(2000);
  console.log("reload 后 h1:", await p.locator("h1.h2").count(), "| input:", await p.locator('input[type="file"]').count());
  console.log("失败请求:", bad.slice(0, 5).join("\n") || "无");
  await b.close();
})();
