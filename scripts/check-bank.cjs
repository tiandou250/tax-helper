/**
 * 发票版式回归：把 samples 全部送进解析器，逐字段对照 expected.json。
 *
 * 前置：先跑 node scripts/make-invoice-bank.cjs，并启动本地服务
 * 用法：node scripts/check-bank.cjs [url]
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

const DIR = "D:/file/temp/bank";
const URL = process.argv[2] || "http://localhost:3000/dev-parse/";

const manifest = JSON.parse(fs.readFileSync(path.join(DIR, "expected.json"), "utf8"));

const near = (a, b) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 0.02;

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').first().waitFor({ state: "attached", timeout: 60000 });

  await page.locator('input[type="file"]').first().setInputFiles(manifest.map((m) => path.join(DIR, m.file)));
  await page.waitForFunction(() => Array.isArray(window.__PARSE) && window.__PARSE.length > 0, null, {
    timeout: 180000,
  });
  await page.waitForTimeout(1500);
  const rows = await page.evaluate(() => window.__PARSE);

  const byName = new Map(rows.map((r) => [r.name, r]));
  const fails = [];
  const lines = [];

  for (const m of manifest) {
    const r = byName.get(m.file);
    if (!r) {
      lines.push(`✗ ${m.file}  未返回结果`);
      fails.push(m.file);
      continue;
    }
    const f = r.fields || {};
    const e = m.expect;
    const bad = [];

    if (e.reject) {
      if (r.ok) bad.push(`应拒绝却识别成功 (总价 ${f.total})`);
    } else {
      if (!r.ok) {
        bad.push(`识别失败：${(r.errors || []).join(" / ").slice(0, 90)}`);
      } else {
        if (e.number && f.number !== e.number) bad.push(`number ${f.number ?? "空"} ≠ ${e.number}`);
        if (e.code && f.code !== e.code) bad.push(`code ${f.code ?? "空"} ≠ ${e.code}`);
        if (e.date && f.date !== e.date) bad.push(`date ${f.date ?? "空"} ≠ ${e.date}`);
        if (e.seller && !String(f.seller || "").includes(e.seller))
          bad.push(`seller ${f.seller ?? "空"} ≠ ${e.seller}`);
        if (e.amount !== undefined && !near(f.amount, e.amount)) bad.push(`amount ${f.amount ?? "空"} ≠ ${e.amount}`);
        if (e.tax !== undefined && !near(f.tax, e.tax)) bad.push(`tax ${f.tax ?? "空"} ≠ ${e.tax}`);
        if (e.total !== undefined && !near(f.total, e.total)) bad.push(`total ${f.total ?? "空"} ≠ ${e.total}`);
        if (e.rate !== undefined && !near(f.rate, e.rate)) bad.push(`rate ${f.rate ?? "空"} ≠ ${e.rate}`);
        if (e.item && !String(f.itemName || "").includes(e.item)) bad.push(`item ${f.itemName ?? "空"} ≠ ${e.item}`);
        if (e.kind && f.kind !== e.kind) bad.push(`kind ${f.kind ?? "空"} ≠ ${e.kind}`);
      }
    }

    if (bad.length === 0) {
      lines.push(`✓ ${m.file}  [${r.confidence}] ${r.ms}ms`);
    } else {
      lines.push(`✗ ${m.file}  [${r.confidence}]`);
      bad.forEach((b) => lines.push(`    · ${b}`));
      fails.push(m.file);
      const txt = (r.text || "").split("\n").slice(0, 40).join("\n");
      lines.push("    ┌─ 文字层 ─");
      txt.split("\n").forEach((l) => lines.push(`    │ ${l}`));
      lines.push("    └──────────");
    }
  }

  console.log(lines.join("\n"));
  console.log(`\n通过 ${manifest.length - fails.length}/${manifest.length}`);

  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
