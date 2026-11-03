/**
 * 财务报表解析回归：逐科目对照 expected.json。
 * 前置：node scripts/make-statement-bank.cjs，且本地服务已启动。
 * 用法：node scripts/check-statements.cjs [url]
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

const DIR = "D:/file/temp/statements";
const URL = process.argv[2] || "http://localhost:3000/dev-parse/";
const manifest = JSON.parse(fs.readFileSync(path.join(DIR, "expected.json"), "utf8"));

const near = (a, b) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 0.02;

(async () => {
  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: ["--no-sandbox", "--no-proxy-server"],
  });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(URL, { waitUntil: "networkidle" });
  // 报表输入框只在「财务报表」模块下渲染
  const stmtTab = page.getByRole("button", { name: "财务报表" });
  if (await stmtTab.count()) {
    await stmtTab.first().click();
    await page.waitForTimeout(400);
  }
  const inputs = page.locator('input[type="file"]');
  await inputs.nth(2).waitFor({ state: "attached", timeout: 60000 });
  await inputs.nth(2).setInputFiles(manifest.map((m) => path.join(DIR, m.file)));
  await page.waitForFunction(() => Array.isArray(window.__STMT), null, { timeout: 120000 });
  await page.waitForTimeout(1200);
  const parsed = await page.evaluate(() => window.__STMT);

  const byFile = new Map();
  for (const p of parsed) {
    const list = byFile.get(p.file) ?? [];
    list.push(p);
    byFile.set(p.file, list);
  }

  let pass = 0;
  const fails = [];
  const lines = [];

  for (const m of manifest) {
    const docs = byFile.get(m.file) ?? [];
    const bad = [];
    if (docs.length === 0) bad.push("没有任何输出");
    if (m.expect.sheets && docs.length !== m.expect.sheets) bad.push(`工作表数 ${docs.length} ≠ ${m.expect.sheets}`);

    if (docs.length && m.expect.kind) {
      const d = docs[0];
      if (d.kind !== m.expect.kind) bad.push(`类型 ${d.kind} ≠ ${m.expect.kind}`);
      if (m.expect.period && d.period !== m.expect.period) bad.push(`期间 ${d.period || "空"} ≠ ${m.expect.period}`);
    }

    if (m.expect.items) {
      // 多工作表时把三张表合并起来核对
      const merged = Object.assign({}, ...docs.map((d) => d.items || {}));
      for (const [k, v] of Object.entries(m.expect.items)) {
        if (!near(merged[k], v)) bad.push(`${k}=${merged[k] ?? "缺失"} ≠ ${v}`);
      }
    }

    if (bad.length === 0) lines.push(`✓ ${m.file}`);
    else {
      lines.push(`✗ ${m.file}`);
      bad.forEach((b) => lines.push(`    · ${b}`));
      fails.push(m.file);
      lines.push("    parsed: " + JSON.stringify(docs.map((d) => ({ kind: d.kind, period: d.period, n: Object.keys(d.items || {}).length }))));
    }
  }

  console.log(lines.join("\n"));
  console.log(`\n通过 ${manifest.length - fails.length}/${manifest.length}`);
  console.log("页面错误:", errs.length ? errs : "无");
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
