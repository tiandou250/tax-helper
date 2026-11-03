const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const OUT = "D:/file/temp/fixtures";

// 仿真实数电票版式：标签带字间距、20 位票号、多项目明细
const real = `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:"Microsoft YaHei",sans-serif;font-size:11px;color:#000;padding:24px}
h1{font-size:15px;text-align:center;letter-spacing:6px;margin:0 0 14px}
.lbl{letter-spacing:3px}
table{width:100%;border-collapse:collapse}
td,th{border:1px solid #555;padding:5px;font-size:10px}
.r{text-align:right}
.hd{display:flex;justify-content:space-between;margin-bottom:10px}
</style></head><body>
<h1>电子发票（增值税专用发票）</h1>
<div class="hd"><span><span class="lbl">发票号码</span>：25322000000098765432</span><span><span class="lbl">开票日期</span>：2026年10月12日</span></div>
<div class="hd"><span>购买方信息 名称：南京数联智能科技有限公司 统一社会信用代码/纳税人识别号：91320100MA1ABCDE12</span></div>
<div class="hd"><span>销售方信息 名称：杭州云启数据服务有限公司 统一社会信用代码/纳税人识别号：91330100MA2FGHIJ34</span></div>
<table>
<tr><th>项目名称</th><th>规格型号</th><th>单位</th><th>数量</th><th>单价</th><th>金额</th><th>税率/征收率</th><th>税额</th></tr>
<tr><td>*信息技术服务*数据服务费</td><td></td><td>项</td><td class="r">1</td><td class="r">200000.00</td><td class="r">200000.00</td><td class="r">6%</td><td class="r">12000.00</td></tr>
<tr><td>*信息技术服务*运维服务</td><td></td><td>项</td><td class="r">1</td><td class="r">40000.00</td><td class="r">40000.00</td><td class="r">6%</td><td class="r">2400.00</td></tr>
<tr><td class="r" colspan="5">合　计</td><td class="r">¥240000.00</td><td></td><td class="r">¥14400.00</td></tr>
</table>
<div class="hd" style="margin-top:10px"><span>价税合计（大写）贰拾伍万肆仟肆佰圆整</span><span>（小写）¥254400.00</span></div>
</body></html>`;

// 只有图像层的 PDF（模拟版式转曲/扫描件），内含发票二维码
const png = fs.readFileSync(path.join(OUT, "sample-发票照片.png")).toString("base64");
const imgOnly = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;padding:20px}img{width:100%}
</style></head><body><img src="data:image/png;base64,${png}"></body></html>`;

(async () => {
  const b = await chromium.launch({ channel: "msedge", headless: true, args: ["--no-sandbox"] });
  const p = await b.newPage();
  await p.setContent(real, { waitUntil: "networkidle" });
  await p.pdf({ path: path.join(OUT, "sample-真实版式.pdf"), format: "A4", printBackground: true });
  await p.setContent(imgOnly, { waitUntil: "networkidle" });
  await p.pdf({ path: path.join(OUT, "sample-图像版.pdf"), format: "A4", printBackground: true });
  await b.close();
  for (const f of fs.readdirSync(OUT)) console.log(f);
})();
