/**
 * 看板回归：两个模块的可视化看板
 *   node scripts/check-insights.cjs [url]
 * 前置：pnpm dev（或指向已部署地址）
 *
 * 覆盖：
 *  1. 发票侧：看板出现位置、8 张图表卡、图形元素数量、hover 提示
 *  2. 报表侧：按导入的表条件渲染、跨期趋势、口径对比
 *  3. 布局：横向溢出、SVG 文字越界、同行卡片等高、导入卡与内容左右对齐
 *  4. 区块底色白/#F5F5F7 交替（两个模块各测一遍）
 *  5. 移动端 390px
 */
const fs = require("fs");
const { chromium } = require("playwright-core");

const CSV = "D:/file/temp/viz-invoices.csv";
const BANK = "D:/file/temp/bank";
const ST = "D:/file/temp/statements";
const STMT = "D:/file/宜昌金亚房地产有限公司-2025年报表.xlsx";
const URL = process.argv[2] || "http://localhost:3000/";

function makeCsv() {
  const head = "发票类型,发票种类,开票日期,发票号码,对方单位,商品名称,不含税金额,税率,税额,价税合计";
  const rows = [];
  let n = 1;
  for (const [m, out, inp] of [
    ["2026-07", 420000, 260000],
    ["2026-08", 560000, 300000],
    ["2026-09", 380000, 620000],
    ["2026-10", 830000, 240000],
  ]) {
    for (const [dir, kind, amt, rate, cp] of [
      ["销项", "专票", out * 0.6, 6, "甲客户有限公司"],
      ["销项", "专票", out * 0.4, 13, "乙客户有限公司"],
      ["进项", "专票", inp * 0.7, 13, "丙供应商有限公司"],
      ["进项", "普票", inp * 0.3, 13, "丁办公用品公司"],
    ]) {
      const a = Math.round(amt * 100) / 100;
      const tax = Math.round(a * (rate / 100) * 100) / 100;
      rows.push(
        [dir, kind, `${m}-08`, `253200000000${String(n++).padStart(4, "0")}`, cp, "技术服务费",
         a.toFixed(2), rate, tax.toFixed(2), (a + tax).toFixed(2)].join(","),
      );
    }
  }
  fs.writeFileSync(CSV, "\uFEFF" + head + "\n" + rows.join("\n"), "utf8");
}

const PROBE = () => {
  const out = { texts: [], overflow: [], heights: {}, rounds: [], overlaps: [] };
  for (const [name, root] of [["insights", document.querySelector("#insights")], ["fin", document.querySelector("#fin-insights")]]) {
    if (!root) continue;
    root.querySelectorAll("svg").forEach((svg, si) => {
      const vb = svg.viewBox.baseVal;
      const boxes = [];
      svg.querySelectorAll("text").forEach((t) => {
        let bb;
        try { bb = t.getBBox(); } catch { return; }
        if (!bb || bb.width === 0) return;
        if (bb.x < -2 || bb.x + bb.width > vb.width + 2 || bb.y < -2 || bb.y + bb.height > vb.height + 2) {
          out.texts.push(`${name}#${si} "${t.textContent?.slice(0, 16)}" x=${Math.round(bb.x)} w=${Math.round(bb.width)}/${Math.round(vb.width)}`);
        }
        boxes.push({ s: t.textContent?.slice(0, 14), x1: bb.x, y1: bb.y, x2: bb.x + bb.width, y2: bb.y + bb.height });
      });
      // 文字两两相交 = 排版重叠，任何图表都不该出现
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], c = boxes[j];
          const ox = Math.min(a.x2, c.x2) - Math.max(a.x1, c.x1);
          const oy = Math.min(a.y2, c.y2) - Math.max(a.y1, c.y1);
          if (ox > 1 && oy > 1) {
            out.overlaps.push(`${name}#${si} "${a.s}"×"${c.s}" 重叠 ${Math.round(ox)}×${Math.round(oy)}px`);
          }
        }
      }
    });
    root.querySelectorAll("*").forEach((el) => {
      if (el.scrollWidth - el.clientWidth > 2 && el.clientWidth > 0) {
        const cls = String(el.className?.baseVal ?? el.className ?? "");
        // 表格与宽图表是「有意横向滚动」，不算溢出；页面本身不允许横向滚动
        if (/review-scroll|table-scroll|viz-scroll/.test(cls)) return;
        out.overflow.push(`${name} .${cls.slice(0, 40)} ${el.scrollWidth}>${el.clientWidth}`);
      }
    });
    root.querySelectorAll(".grid").forEach((g, gi) => {
      const hs = [...g.children].map((c) => Math.round((c.querySelector(".card") ?? c).getBoundingClientRect().height));
      if (hs.length > 1 && new Set(hs).size > 1) out.heights[`${name}-grid${gi}`] = hs;
    });
  }
  const card = document.querySelector(".pane-aside .card");
  const wrap = document.querySelector(".pane-main .wrap");
  // 比较两边的「内容左沿」：wrap 本身含 24px 内边距，取它的第一个子元素
  const wrapInner = wrap?.firstElementChild ?? wrap;
  out.rounds = {
    pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    align: card && wrapInner
      ? Math.round(card.getBoundingClientRect().left) - Math.round(wrapInner.getBoundingClientRect().left)
      : null,
    tints: [...document.querySelectorAll("section.section")].map(
      (s) => `${s.id}:${getComputedStyle(s).backgroundColor === "rgb(245, 245, 247)" ? "alt" : "白"}`),
  };
  return out;
};

let pass = 0;
let fail = 0;
const check = (label, ok, extra = "") => {
  if (ok) { pass++; console.log(`  ✓ ${label}${extra ? " " + extra : ""}`); }
  else { fail++; console.log(`  ✗ ${label}${extra ? " " + extra : ""}`); }
};

(async () => {
  makeCsv();
  const b = await chromium.launch({ channel: "msedge", headless: true, args: ["--no-sandbox", "--no-proxy-server"] });
  const p = await b.newPage({ viewport: { width: 1440, height: 1100 } });
  const errs = [];
  p.on("pageerror", (e) => errs.push("PAGE " + e.message.slice(0, 140)));
  p.on("console", (m) => m.type() === "error" && !m.text().includes("favicon") && errs.push(m.text().slice(0, 140)));

  await p.goto(URL, { waitUntil: "networkidle" });
  await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(900);

  /* ---------- 1. 发票侧 ---------- */
  console.log("\n[1] 发票看板与入口");
  check("未导入数据时不出现看板", (await p.locator("#insights").count()) === 0);
  check("空态不显示看板入口", (await p.locator(".nav__board").count()) === 0);

  await p.locator("#import input[type=file]").setInputFiles([CSV, `${BANK}/01-数电专票.pdf`]);
  await p.waitForTimeout(5000);
  await p.locator(".import-foot .btn--primary").click();
  await p.waitForTimeout(1800);

  const cards = await p.$$eval("#insights .viz-card h3", (els) => els.map((e) => e.innerText));
  check("8 张图表卡", cards.length === 8, cards.join(" / "));
  check("统计卡 4 张", (await p.locator("#insights .stat").count()) === 4);

  const gfx = await p.evaluate(() => ({
    svg: document.querySelectorAll("#insights svg").length,
    donut: document.querySelectorAll("#insights .donut").length,
    stacked: document.querySelectorAll("#insights .stacked__row").length,
    ratio: document.querySelectorAll("#insights .ratio").length,
  }));
  check("图形元素齐全", gfx.svg === 7 && gfx.donut === 3 && gfx.stacked === 2, JSON.stringify(gfx));

  // 看板位置：在「应缴税费」之后
  const order = await p.evaluate(() => {
    const ids = [...document.querySelectorAll("section.section")].map((s) => s.id);
    return ids;
  });
  check("位于应缴税费之后、参数之前", order.indexOf("insights") === order.indexOf("tax") + 1 && order.indexOf("params") > order.indexOf("insights"), order.join(" → "));

  // 看板埋在页面深处，导航必须有直达入口
  const navLabel = await p.locator(".nav__board").innerText().catch(() => "");
  check("导航出现「经营看板」入口", navLabel.includes("经营看板"), navLabel.replace(/\s+/g, " "));
  await p.locator(".nav__board").click();
  await p.waitForTimeout(1300);
  const jump = await p.evaluate(() => Math.round(document.querySelector("#insights").getBoundingClientRect().top));
  check("入口能跳到看板且不被导航遮挡", jump > 0 && jump < 140, `距视口顶 ${jump}px`);

  await p.evaluate(() => window.scrollTo(0, document.querySelector("#insights").offsetTop - 40));
  await p.waitForTimeout(700);
  const box = await p.locator("#insights .viz").first().boundingBox();
  if (box) {
    await p.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await p.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5, { steps: 5 });
    await p.waitForTimeout(420);
    const tip = await p.locator("#insights .viz-tip").first().innerText().catch(() => "");
    check("hover 显示提示", tip.includes("销项税额"), tip.replace(/\s+/g, " ").slice(0, 60));
    await p.mouse.move(0, 0);
    await p.waitForTimeout(220);
    check("移开后提示消失", (await p.locator("#insights .viz-tip").count()) === 0);
  }

  /* ---------- 2. 报表侧 ---------- */
  console.log("\n[2] 财报看板");
  await p.getByRole("button", { name: "财务报表" }).click();
  await p.waitForTimeout(500);
  check("无报表时看板不渲染", (await p.locator("#fin-insights").count()) === 0);
  check("报表模块不出现发票看板", (await p.locator("#insights").count()) === 0);
  check("报表模块未导入报表时无入口", (await p.locator(".nav__board").count()) === 0);

  const add = async (files) => {
    await p.locator("#statement-import input[type=file]").setInputFiles(files);
    await p.waitForTimeout(2600);
    const btn = p.getByRole("button", { name: /确认导入/ });
    if (await btn.count()) { await btn.click(); await p.waitForTimeout(1200); }
  };

  await add([`${ST}/资产负债表-年初期末数.csv`]);
  let finCards = await p.$$eval("#fin-insights .viz-card h3", (els) => els.map((e) => e.innerText));
  check("只有资产负债表 → 只出资产类卡", finCards.includes("资产结构") && !finCards.some((c) => c.includes("利润形成")), finCards.join(" / "));

  await add([`${ST}/利润表-标准.csv`]);
  await add([`${ST}/利润表-本月累计.csv`]);
  finCards = await p.$$eval("#fin-insights .viz-card h3", (els) => els.map((e) => e.innerText));
  check("两张利润表 → 出现跨期趋势", finCards.some((c) => c.includes("跨期趋势")), finCards.join(" / "));
  check("出现口径对比", finCards.some((c) => /本年累计 vs 上年累计|期末 vs 年初/.test(c)));
  check("不出现现金流卡（未导入）", !finCards.some((c) => c.includes("现金流")));
  check("瀑布图有 8 步以上", (await p.locator("#fin-insights svg").first().locator("text").count()) > 16);
  const finNav = await p.locator(".nav__board").innerText().catch(() => "");
  check("导航入口随模块切换为「财务看板」", finNav.includes("财务看板"), finNav.replace(/\s+/g, " "));

  /* ---------- 3. 真实年报 ---------- */
  console.log("\n[3] 真实年报");
  await p.evaluate(() => sessionStorage.removeItem("piaoshui.ss.statements"));
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(1000);
  await p.getByRole("button", { name: "财务报表" }).click();
  await p.waitForTimeout(400);
  await add([STMT]);
  const stats = await p.$$eval("#fin-insights .stat", (els) => els.map((e) => e.innerText.replace(/\s+/g, " ")));
  check("营业收入 5.1 亿", stats[0].includes("5.1 亿"), stats[0]);
  check("同比 -48.4%", stats[0].includes("48.4"), stats[0]);
  check("利润总额 0.5 亿", stats[1].includes("0.5 亿"), stats[1]);
  check("资产总计 42.3 亿", stats[2].includes("42.3 亿"), stats[2]);
  const ratios = await p.$$eval("#fin-insights .ratio", (els) => els.map((e) => e.innerText.replace(/\s+/g, " ")));
  check("偿债比率 5 项", ratios.filter((r) => /资产负债率|流动比率|速动比率|净资产占比|存货/.test(r)).length === 5);

  /* ---------- 4. 布局 ---------- */
  console.log("\n[4] 布局与配色");
  const h = await p.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < h; y += 700) { await p.evaluate((v) => window.scrollTo(0, v), y); await p.waitForTimeout(110); }
  await p.waitForTimeout(500);
  const desk = await p.evaluate(PROBE);
  check("无横向溢出", desk.rounds.pageOverflow === 0);
  check("导入卡与内容左沿对齐", desk.rounds.align === 0, `偏差 ${desk.rounds.align}px`);
  check("SVG 文字无越界", desk.texts.length === 0, desk.texts.slice(0, 2).join(" | "));
  check("图表文字无重叠", desk.overlaps.length === 0, desk.overlaps.slice(0, 3).join(" | "));
  const deskScroll = await p.evaluate(() =>
    [...document.querySelectorAll(".viz-scroll")].map((e) => e.scrollWidth - e.clientWidth));
  check("桌面端宽图表无需横向滚动", deskScroll.every((v) => v <= 2), `溢出 ${deskScroll.join("/")}px`);
  check("无元素横向溢出", desk.overflow.length === 0, desk.overflow.slice(0, 2).join(" | "));
  check("同行卡片等高", Object.keys(desk.heights).length === 0, JSON.stringify(desk.heights));
  const tints = desk.rounds.tints.map((t) => t.split(":")[1]);
  const alternate = tints.every((t, i) => i === 0 || t !== tints[i - 1]);
  check("报表模块底色交替", alternate, desk.rounds.tints.join(" → "));

  await p.getByRole("button", { name: "发票" }).click();
  await p.waitForTimeout(600);
  const invTints = await p.evaluate(() =>
    [...document.querySelectorAll("section.section")].map(
      (s) => `${s.id}:${getComputedStyle(s).backgroundColor === "rgb(245, 245, 247)" ? "alt" : "白"}`));
  const invAlt = invTints.map((t) => t.split(":")[1]).every((t, i, a) => i === 0 || t !== a[i - 1]);
  check("发票模块底色交替", invAlt, invTints.join(" → "));

  /* ---------- 5. 移动端 ---------- */
  console.log("\n[5] 移动端 390px");
  await p.setViewportSize({ width: 390, height: 844 });
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  const h2 = await p.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < h2; y += 700) { await p.evaluate((v) => window.scrollTo(0, v), y); await p.waitForTimeout(90); }
  await p.waitForTimeout(400);
  const mob = await p.evaluate(PROBE);
  check("发票模块 无横向溢出", mob.rounds.pageOverflow === 0);
  check("发票模块 SVG 文字无越界", mob.texts.length === 0, mob.texts.slice(0, 2).join(" | "));
  check("发票模块 图表文字无重叠", mob.overlaps.length === 0, mob.overlaps.slice(0, 3).join(" | "));
  check("发票模块 无元素横向溢出", mob.overflow.length === 0, mob.overflow.slice(0, 2).join(" | "));

  // 报表模块在窄屏下也要单独量一遍（瀑布图有 8 个柱，最容易挤）
  await p.getByRole("button", { name: "财务报表" }).click();
  await p.waitForTimeout(1200);
  const h3 = await p.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < h3; y += 700) { await p.evaluate((v) => window.scrollTo(0, v), y); await p.waitForTimeout(90); }
  await p.waitForTimeout(400);
  const mobFin = await p.evaluate(PROBE);
  check("报表模块 无横向溢出", mobFin.rounds.pageOverflow === 0);
  check("报表模块 SVG 文字无越界", mobFin.texts.length === 0, mobFin.texts.slice(0, 2).join(" | "));
  check("报表模块 图表文字无重叠", mobFin.overlaps.length === 0, mobFin.overlaps.slice(0, 3).join(" | "));
  check("报表模块 无元素横向溢出", mobFin.overflow.length === 0, mobFin.overflow.slice(0, 2).join(" | "));
  const mobScroll = await p.evaluate(() => {
    const el = document.querySelector("#fin-insights .viz-scroll");
    return el ? { over: el.scrollWidth - el.clientWidth, hint: document.querySelectorAll(".viz-scroll-hint").length } : null;
  });
  check("窄屏瀑布图改用横向滚动并有提示", Boolean(mobScroll && mobScroll.over > 20 && mobScroll.hint > 0), JSON.stringify(mobScroll));

  console.log(`\n通过 ${pass} / 失败 ${fail}`);
  console.log("运行时错误:", errs.length ? errs : "无");
  await b.close();
  process.exit(fail > 0 || errs.length > 0 ? 1 : 0);
})();
