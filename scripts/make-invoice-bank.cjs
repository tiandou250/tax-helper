/**
 * 生成「发票版式样本集」：覆盖税局实际会遇到的十余种 PDF 版式，
 * 每份都带期望值，供 scripts/check-bank.cjs 逐字段判定。
 *
 * 用法：node scripts/make-invoice-bank.cjs
 * 产物：D:/file/temp/bank/*.pdf + expected.json
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

const OUT = "D:/file/temp/bank";
fs.mkdirSync(OUT, { recursive: true });

const CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; padding: 18px 22px; font-family: "Microsoft YaHei", SimSun, sans-serif;
         font-size: 11px; color: #111; }
  h1 { font-size: 16px; text-align: center; margin: 0 0 6px; font-weight: 600; }
  .sub { text-align: center; font-size: 10px; color: #444; margin-bottom: 10px; }
  .hdr { display: flex; justify-content: space-between; margin: 4px 0; font-size: 11px; }
  .lbl { letter-spacing: 1px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border: 1px solid #666; padding: 4px 5px; font-size: 10px; vertical-align: middle; }
  th { background: #f2f2f2; font-weight: 400; }
  .r { text-align: right; }
  .block { border: 1px solid #666; padding: 5px 6px; margin-top: 6px; font-size: 10.5px; }
  .row { display: flex; gap: 0; }
  .row > div { flex: 1; }
  .big { font-size: 12px; }
  .sp { letter-spacing: 3px; }
  .tight { font-size: 10px; }
`;

/* 逐字拆开的文本（模拟某些发票生成器把每个汉字单独输出成一个文本块） */
const split = (s) => [...s].map((c) => `<span>${c}</span>`).join("");

const page = (body) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}</body></html>`;

/* ------------------------------------------------------------------ */
/* 各版式                                                              */
/* ------------------------------------------------------------------ */

const FIXTURES = [];

/** 1. 数电票 · 增值税专用发票（标准版式） */
FIXTURES.push({
  file: "01-数电专票.pdf",
  expect: {
    number: "25322000000011223344",
    date: "2026-10-08",
    seller: "杭州云启数据服务有限公司",
    amount: 200000,
    tax: 12000,
    total: 212000,
    rate: 6,
    item: "数据服务费",
    kind: "special",
  },
  html: page(`
    <h1>电子发票（增值税专用发票）</h1>
    <div class="hdr">
      <span>发票号码：25322000000011223344</span>
      <span>开票日期：2026年10月08日</span>
    </div>
    <div class="block">
      购买方信息　名称：南京数联智能科技有限公司　统一社会信用代码/纳税人识别号：91320100MA1ABCDE12
    </div>
    <div class="block">
      销售方信息　名称：杭州云启数据服务有限公司　统一社会信用代码/纳税人识别号：91330100MA2FGHIJ34
    </div>
    <table>
      <tr><th style="width:34%">项目名称</th><th>规格型号</th><th>单位</th><th class="r">数量</th><th class="r">单价</th><th class="r">金额</th><th class="r">税率/征收率</th><th class="r">税额</th></tr>
      <tr><td>*信息技术服务*数据服务费</td><td></td><td>项</td><td class="r">1</td><td class="r">200000.00</td><td class="r">200000.00</td><td class="r">6%</td><td class="r">12000.00</td></tr>
      <tr><td class="r" colspan="5">合　计</td><td class="r">¥200000.00</td><td></td><td class="r">¥12000.00</td></tr>
    </table>
    <div class="hdr" style="margin-top:8px">
      <span>价税合计（大写）贰拾壹万贰仟圆整</span><span>（小写）¥212000.00</span>
    </div>
    <div class="hdr"><span>销售方开户行及账号：招商银行杭州分行 571900123456789</span><span>收款人：李明　复核：王芳　开票人：张伟</span></div>
  `),
});

/** 2. 数电票 · 普通发票（3%，含两行明细） */
FIXTURES.push({
  file: "02-数电普票-3%.pdf",
  expect: {
    number: "25322000000022334455",
    date: "2026-10-15",
    seller: "南京星海办公用品有限公司",
    amount: 8000,
    tax: 240,
    total: 8240,
    rate: 3,
    item: "复印纸",
    kind: "ordinary",
  },
  html: page(`
    <h1>电子发票（普通发票）</h1>
    <div class="hdr">
      <span class="lbl">发 票 号 码</span><span>25322000000022334455</span>
      <span class="lbl">开 票 日 期</span><span>2026年10月15日</span>
    </div>
    <div class="block">购买方信息　名称：南京数联智能科技有限公司　纳税人识别号：91320100MA1ABCDE12</div>
    <div class="block">销售方信息　名称：南京星海办公用品有限公司　纳税人识别号：91320100MA9ZZYYXX1</div>
    <table>
      <tr><th style="width:38%">项目名称</th><th>单位</th><th class="r">数量</th><th class="r">金额</th><th class="r">税率/征收率</th><th class="r">税额</th></tr>
      <tr><td>*纸制品*复印纸</td><td>箱</td><td class="r">20</td><td class="r">6000.00</td><td class="r">3%</td><td class="r">180.00</td></tr>
      <tr><td>*文具*签字笔</td><td>盒</td><td class="r">40</td><td class="r">2000.00</td><td class="r">3%</td><td class="r">60.00</td></tr>
      <tr><td class="r" colspan="3">合　计</td><td class="r">¥8000.00</td><td></td><td class="r">¥240.00</td></tr>
    </table>
    <div class="hdr" style="margin-top:8px">
      <span>价税合计（大写）捌仟贰佰肆拾圆整</span><span>（小写）¥8240.00</span>
    </div>
  `),
});

/** 3. 旧版增值税专用发票（发票代码 + 8 位号码 + 密码区） */
FIXTURES.push({
  file: "03-旧版专票.pdf",
  expect: {
    code: "032001900111",
    number: "12345678",
    date: "2026-09-22",
    seller: "苏州东吴建筑装饰工程有限公司",
    amount: 156000,
    tax: 14040,
    total: 170040,
    rate: 9,
    item: "装修工程",
    kind: "special",
  },
  html: page(`
    <h1 class="sp">江苏增值税专用发票</h1>
    <div class="sub">发票联　开票日期：2026年09月22日</div>
    <div class="hdr">
      <span>发票代码：032001900111</span>
      <span>发票号码：12345678</span>
      <span>机器编号：499095432100</span>
    </div>
    <div class="row">
      <div class="block" style="margin-right:6px">购货单位　名称：南京数联智能科技有限公司<br>纳税人识别号：91320100MA1ABCDE12</div>
      <div class="block" style="margin-left:6px">密码区　01&gt;12&lt;34&gt;&gt;5678&lt;9&gt;&gt;0123&lt;&lt;456789</div>
    </div>
    <div class="block">销货单位　名称：苏州东吴建筑装饰工程有限公司　纳税人识别号：91320500MA3QWERT56</div>
    <table>
      <tr><th style="width:36%">货物或应税劳务、服务名称</th><th>规格型号</th><th>单位</th><th class="r">数量</th><th class="r">单价</th><th class="r">金额</th><th class="r">税率</th><th class="r">税额</th></tr>
      <tr><td>装修工程</td><td></td><td>项</td><td class="r">1</td><td class="r">156000.00</td><td class="r">156000.00</td><td class="r">9%</td><td class="r">14040.00</td></tr>
      <tr><td class="r" colspan="5">合计</td><td class="r">¥156000.00</td><td></td><td class="r">¥14040.00</td></tr>
    </table>
    <div class="hdr" style="margin-top:8px">
      <span>价税合计（大写）　壹拾柒万零肆拾圆整</span><span>（小写）¥170040.00</span>
    </div>
    <div class="hdr"><span>收款人：陈刚　复核：刘洋　开票人：孙丽　销售方：（章）</span></div>
  `),
});

/** 4. 增值税电子普通发票（小规模 1% 征收率） */
FIXTURES.push({
  file: "04-电子普票-1%.pdf",
  expect: {
    number: "26322000000033445566",
    date: "2026-10-03",
    seller: "南京城东物流有限公司",
    amount: 16800,
    tax: 168,
    total: 16968,
    rate: 1,
    item: "货物运输",
    kind: "ordinary",
  },
  html: page(`
    <h1>增值税电子普通发票</h1>
    <div class="hdr">
      <span>发票代码：032001900222</span><span>发票号码：26322000000033445566</span>
      <span>开票日期：2026年10月03日</span>
    </div>
    <div class="block">购买方　名称：南京数联智能科技有限公司　纳税人识别号：91320100MA1ABCDE12</div>
    <div class="block">销售方　名称：南京城东物流有限公司　纳税人识别号：91320100MA5TYUIOP8</div>
    <table>
      <tr><th style="width:38%">货物或应税劳务名称</th><th>单位</th><th class="r">数量</th><th class="r">金额</th><th class="r">征收率</th><th class="r">税额</th></tr>
      <tr><td>*运输服务*货物运输</td><td>次</td><td class="r">1</td><td class="r">16800.00</td><td class="r">1%</td><td class="r">168.00</td></tr>
      <tr><td class="r" colspan="3">合计</td><td class="r">¥16800.00</td><td></td><td class="r">¥168.00</td></tr>
    </table>
    <div class="hdr" style="margin-top:8px">
      <span>价税合计（大写）壹万陆仟玖佰陆拾捌圆整</span><span>（小写）¥16968.00</span>
    </div>
  `),
});

/** 5. 不动产销售（5%，差额征税字样） */
FIXTURES.push({
  file: "05-不动产-5%.pdf",
  expect: {
    number: "26422000003768591631",
    date: "2026-10-27",
    seller: "宜昌律信投资有限公司",
    amount: 832408.57,
    tax: 41620.43,
    total: 874029,
    rate: 5,
    item: "房地产开发",
    kind: "special",
  },
  html: page(`
    <h1>电子发票（增值税专用发票）</h1>
    <div class="hdr">
      <span>发票号码：26422000003768591631</span>
      <span>开票日期：2026年10月27日</span>
      <span>下载次数：1</span>
    </div>
    <div class="block">购买方信息　名称：宜昌金亚房地产有限公司　统一社会信用代码/纳税人识别号：91420500MA4ABCDE1X</div>
    <div class="block">销售方信息　名称：宜昌律信投资有限公司　统一社会信用代码/纳税人识别号：91420500MA4KWERT99</div>
    <table>
      <tr><th style="width:30%">项目名称</th><th>规格型号</th><th>单位</th><th class="r">数量</th><th class="r">单价</th><th class="r">金额</th><th class="r">税率/征收率</th><th class="r">税额</th></tr>
      <tr><td>*不动产*房地产开发</td><td></td><td>套</td><td class="r">1</td><td class="r">832408.57</td><td class="r">832408.57</td><td class="r">5%</td><td class="r">41620.43</td></tr>
      <tr><td class="r" colspan="5">合　计</td><td class="r">¥832408.57</td><td></td><td class="r">¥41620.43</td></tr>
    </table>
    <div class="hdr" style="margin-top:8px">
      <span>价税合计（大写）捌拾柒万肆仟零贰拾玖圆整</span><span>（小写）¥874029.00</span>
    </div>
    <div class="hdr"><span>备注：差额征税</span></div>
  `),
});

/** 6. 多项目（4 行明细，税率混合） */
FIXTURES.push({
  file: "06-多项目.pdf",
  expect: {
    number: "25322000000044556677",
    date: "2026-10-18",
    seller: "上海寅晟贸易有限公司",
    amount: 300000,
    tax: 19400,
    total: 319400,
    rate: 6,
    item: "软件开发服务",
    kind: "special",
  },
  html: page(`
    <h1>电子发票（增值税专用发票）</h1>
    <div class="hdr"><span>发票号码：25322000000044556677</span><span>开票日期：2026年10月18日</span></div>
    <div class="block">购买方信息　名称：南京数联智能科技有限公司　纳税人识别号：91320100MA1ABCDE12</div>
    <div class="block">销售方信息　名称：上海寅晟贸易有限公司　纳税人识别号：91310000MA1YUIOP23</div>
    <table>
      <tr><th style="width:32%">项目名称</th><th>单位</th><th class="r">数量</th><th class="r">金额</th><th class="r">税率</th><th class="r">税额</th></tr>
      <tr><td>*信息技术服务*软件开发服务</td><td>项</td><td class="r">1</td><td class="r">150000.00</td><td class="r">6%</td><td class="r">9000.00</td></tr>
      <tr><td>*信息技术服务*运维服务</td><td>项</td><td class="r">1</td><td class="r">80000.00</td><td class="r">6%</td><td class="r">4800.00</td></tr>
      <tr><td>*信息技术服务*技术咨询</td><td>项</td><td class="r">1</td><td class="r">50000.00</td><td class="r">6%</td><td class="r">3000.00</td></tr>
      <tr><td>*电子设备*服务器配件</td><td>套</td><td class="r">1</td><td class="r">20000.00</td><td class="r">13%</td><td class="r">2600.00</td></tr>
      <tr><td class="r" colspan="3">合　计</td><td class="r">¥300000.00</td><td></td><td class="r">¥19400.00</td></tr>
    </table>
    <div class="hdr" style="margin-top:8px"><span>价税合计（大写）叁拾壹万玖仟肆佰圆整</span><span>（小写）¥319400.00</span></div>
  `),
});

/** 7. 免税发票（税率列写「免税」，税额为 ***） */
FIXTURES.push({
  file: "07-免税.pdf",
  expect: {
    number: "25322000000055667788",
    date: "2026-09-30",
    seller: "江苏众诚人力资源有限公司",
    amount: 50000,
    tax: 0,
    total: 50000,
    rate: 0,
    item: "劳务外包服务",
  },
  html: page(`
    <h1>电子发票（普通发票）</h1>
    <div class="hdr"><span>发票号码：25322000000055667788</span><span>开票日期：2026年09月30日</span></div>
    <div class="block">购买方信息　名称：南京数联智能科技有限公司　纳税人识别号：91320100MA1ABCDE12</div>
    <div class="block">销售方信息　名称：江苏众诚人力资源有限公司　纳税人识别号：91320100MA7ASDFG11</div>
    <table>
      <tr><th style="width:40%">项目名称</th><th>单位</th><th class="r">数量</th><th class="r">金额</th><th class="r">税率/征收率</th><th class="r">税额</th></tr>
      <tr><td>*人力资源服务*劳务外包服务</td><td>项</td><td class="r">1</td><td class="r">50000.00</td><td class="r">免税</td><td class="r">***</td></tr>
      <tr><td class="r" colspan="3">合　计</td><td class="r">¥50000.00</td><td></td><td class="r">***</td></tr>
    </table>
    <div class="hdr" style="margin-top:8px"><span>价税合计（大写）伍万圆整</span><span>（小写）¥50000.00</span></div>
  `),
});

/** 8. 两联打印在一页（发票联 + 抵扣联，票号重复） */
FIXTURES.push({
  file: "08-两联同页.pdf",
  expect: {
    number: "25322000000066778899",
    date: "2026-10-09",
    seller: "深圳市联旌电子有限公司",
    amount: 462000,
    tax: 60060,
    total: 522060,
    rate: 13,
    item: "服务器及配件采购",
    kind: "special",
  },
  html: page(
    ["发票联", "抵扣联"]
      .map(
        (tag) => `
    <h1>电子发票（增值税专用发票）</h1>
    <div class="sub">${tag}</div>
    <div class="hdr"><span>发票号码：25322000000066778899</span><span>开票日期：2026年10月09日</span></div>
    <div class="block">购买方信息　名称：南京数联智能科技有限公司　纳税人识别号：91320100MA1ABCDE12</div>
    <div class="block">销售方信息　名称：深圳市联旌电子有限公司　纳税人识别号：91440300MA5LKJHG77</div>
    <table>
      <tr><th style="width:34%">项目名称</th><th>单位</th><th class="r">数量</th><th class="r">金额</th><th class="r">税率</th><th class="r">税额</th></tr>
      <tr><td>*电子设备*服务器及配件采购</td><td>批</td><td class="r">1</td><td class="r">462000.00</td><td class="r">13%</td><td class="r">60060.00</td></tr>
      <tr><td class="r" colspan="3">合　计</td><td class="r">¥462000.00</td><td></td><td class="r">¥60060.00</td></tr>
    </table>
    <div class="hdr" style="margin-top:8px"><span>价税合计（大写）伍拾贰万贰仟零陆拾圆整</span><span>（小写）¥522060.00</span></div>
    <div style="page-break-after:always;height:12px"></div>`,
      )
      .join(""),
  ),
});

/** 9. 逐字拆开的版式（每个汉字单独成块，模拟特殊生成器） */
FIXTURES.push({
  file: "09-逐字拆开.pdf",
  expect: {
    number: "25322000000077889900",
    date: "2026-10-11",
    seller: "合肥云舟信息技术有限公司",
    amount: 52000,
    tax: 3120,
    total: 55120,
    rate: 6,
    item: "技术服务费",
  },
  html: page(`
    <h1>${split("电子发票（增值税专用发票）")}</h1>
    <div class="hdr">
      <span>${split("发票号码：")}25322000000077889900</span>
      <span>${split("开票日期：")}2026年10月11日</span>
    </div>
    <div class="block">${split("购买方信息　名称：南京数联智能科技有限公司")}</div>
    <div class="block">${split("销售方信息　名称：合肥云舟信息技术有限公司")}</div>
    <table>
      <tr><th style="width:38%">${split("项目名称")}</th><th>${split("单位")}</th><th class="r">${split("金额")}</th><th class="r">${split("税率")}</th><th class="r">${split("税额")}</th></tr>
      <tr><td>*信息技术服务*技术服务费</td><td>项</td><td class="r">52000.00</td><td class="r">6%</td><td class="r">3120.00</td></tr>
      <tr><td class="r" colspan="2">${split("合计")}</td><td class="r">¥52000.00</td><td></td><td class="r">¥3120.00</td></tr>
    </table>
    <div class="hdr" style="margin-top:8px">
      <span>${split("价税合计（大写）伍万伍仟壹佰贰拾圆整")}</span>
      <span>${split("（小写）")}¥55120.00</span>
    </div>
  `),
});

/** 10. 紧凑无间距（单元格之间没有任何空白，最容易粘连） */
FIXTURES.push({
  file: "10-紧凑无间距.pdf",
  expect: {
    number: "25322000000088990011",
    date: "2026-10-21",
    seller: "宁波恒美贸易有限公司",
    amount: 386500,
    tax: 50245,
    total: 436745,
    rate: 13,
    item: "智能硬件销售",
  },
  html: page(`
    <style>
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 0; padding: 1px; font-size: 10px; }
      .r { text-align: right; }
    </style>
    <h1 style="font-size:15px;margin:0 0 4px">电子发票（增值税专用发票）</h1>
    <div style="display:flex;justify-content:space-between;font-size:10px">
      <div>发票号码：25322000000088990011</div><div>开票日期：2026年10月21日</div>
    </div>
    <div style="font-size:10px;margin-top:2px">购买方信息　名称：南京数联智能科技有限公司</div>
    <div style="font-size:10px">销售方信息　名称：宁波恒美贸易有限公司</div>
    <table style="margin-top:3px">
      <tr><th style="width:44%">项目名称</th><th>单位</th><th class="r">金额</th><th class="r">税率</th><th class="r">税额</th></tr>
      <tr><td>*电子设备*智能硬件销售</td><td>台</td><td class="r">386500.00</td><td class="r">13%</td><td class="r">50245.00</td></tr>
      <tr><td class="r" colspan="2">合计</td><td class="r">¥386500.00</td><td></td><td class="r">¥50245.00</td></tr>
    </table>
    <div style="display:flex;justify-content:space-between;font-size:10px;margin-top:3px">
      <div>价税合计（大写）肆拾叁万陆仟柒佰肆拾伍圆整</div><div>（小写）¥436745.00</div>
    </div>
  `),
});

/** 11. 不动产经营租赁（9%） */
FIXTURES.push({
  file: "11-租赁-9%.pdf",
  expect: {
    number: "25322000000099001122",
    date: "2026-10-01",
    seller: "南京城建资产经营有限公司",
    amount: 120000,
    tax: 10800,
    total: 130800,
    rate: 9,
    item: "房屋租赁",
    kind: "special",
  },
  html: page(`
    <h1>电子发票（增值税专用发票）</h1>
    <div class="hdr"><span>发票号码：25322000000099001122</span><span>开票日期：2026年10月01日</span></div>
    <div class="block">购买方信息　名称：南京数联智能科技有限公司　纳税人识别号：91320100MA1ABCDE12</div>
    <div class="block">销售方信息　名称：南京城建资产经营有限公司　纳税人识别号：91320100MA1ZXCVB33</div>
    <table>
      <tr><th style="width:36%">项目名称</th><th>单位</th><th class="r">数量</th><th class="r">金额</th><th class="r">税率</th><th class="r">税额</th></tr>
      <tr><td>*不动产经营租赁*房屋租赁</td><td>月</td><td class="r">3</td><td class="r">120000.00</td><td class="r">9%</td><td class="r">10800.00</td></tr>
      <tr><td class="r" colspan="3">合　计</td><td class="r">¥120000.00</td><td></td><td class="r">¥10800.00</td></tr>
    </table>
    <div class="hdr" style="margin-top:8px"><span>价税合计（大写）壹拾叁万零捌佰圆整</span><span>（小写）¥130800.00</span></div>
  `),
});

/** 12. 通行费电子发票（3%） */
FIXTURES.push({
  file: "12-通行费-3%.pdf",
  expect: {
    number: "25322000000100112233",
    date: "2026-09-18",
    seller: "江苏交通控股有限公司",
    amount: 2000,
    tax: 60,
    total: 2060,
    rate: 3,
    item: "通行费",
  },
  html: page(`
    <h1>通行费电子发票</h1>
    <div class="hdr"><span>发票代码：032001900333</span><span>发票号码：25322000000100112233</span><span>开票日期：2026年09月18日</span></div>
    <div class="block">购买方　名称：南京数联智能科技有限公司　纳税人识别号：91320100MA1ABCDE12</div>
    <div class="block">销售方　名称：江苏交通控股有限公司　纳税人识别号：91320000MA1JTKKL88</div>
    <table>
      <tr><th style="width:36%">项目名称</th><th>车牌号</th><th>类型</th><th class="r">金额</th><th class="r">征收率</th><th class="r">税额</th></tr>
      <tr><td>*通行费*高速公路通行费</td><td>苏A88888</td><td>ETC</td><td class="r">2000.00</td><td class="r">3%</td><td class="r">60.00</td></tr>
      <tr><td class="r" colspan="3">合计</td><td class="r">¥2000.00</td><td></td><td class="r">¥60.00</td></tr>
    </table>
    <div class="hdr" style="margin-top:8px"><span>价税合计（大写）贰仟零陆拾圆整</span><span>（小写）¥2060.00</span></div>
  `),
});

/** 13. 大额（千万级，检验千分位与位数） */
FIXTURES.push({
  file: "13-大额千万.pdf",
  expect: {
    number: "25322000000111223344",
    date: "2026-10-25",
    seller: "中建三局集团有限公司",
    amount: 12345678.9,
    tax: 1111111.1,
    total: 13456790,
    rate: 9,
    item: "建筑工程",
    kind: "special",
  },
  html: page(`
    <h1>电子发票（增值税专用发票）</h1>
    <div class="hdr"><span>发票号码：25322000000111223344</span><span>开票日期：2026年10月25日</span></div>
    <div class="block">购买方信息　名称：南京数联智能科技有限公司　纳税人识别号：91320100MA1ABCDE12</div>
    <div class="block">销售方信息　名称：中建三局集团有限公司　纳税人识别号：91420000177601234X</div>
    <table>
      <tr><th style="width:34%">项目名称</th><th>单位</th><th class="r">数量</th><th class="r">金额</th><th class="r">税率</th><th class="r">税额</th></tr>
      <tr><td>*建筑服务*建筑工程</td><td>项</td><td class="r">1</td><td class="r">12,345,678.90</td><td class="r">9%</td><td class="r">1,111,111.10</td></tr>
      <tr><td class="r" colspan="3">合　计</td><td class="r">¥12,345,678.90</td><td></td><td class="r">¥1,111,111.10</td></tr>
    </table>
    <div class="hdr" style="margin-top:8px"><span>价税合计（大写）壹仟叁佰肆拾伍万陆仟柒佰玖拾圆整</span><span>（小写）¥13,456,790.00</span></div>
  `),
});

/** 14. 非发票（银行回单）—— 应当明确拒绝而不是乱读 */
FIXTURES.push({
  file: "14-银行回单.pdf",
  expect: { reject: true },
  html: page(`
    <h1>中国工商银行 电子回单</h1>
    <div class="hdr"><span>回单编号：2026102700123456</span><span>交易日期：2026年10月27日</span></div>
    <table>
      <tr><th>付款人</th><td>南京数联智能科技有限公司</td><th>收款人</th><td>杭州云启数据服务有限公司</td></tr>
      <tr><th>金额</th><td>212000.00</td><th>用途</th><td>服务费</td></tr>
    </table>
  `),
});

/** 15. 红字发票（负数冲销，金额/税额/合计均为负） */
FIXTURES.push({
  file: "15-红字专票.pdf",
  expect: {
    number: "25322000000122334455",
    date: "2026-10-26",
    seller: "杭州云启数据服务有限公司",
    amount: -100000,
    tax: -6000,
    total: -106000,
    rate: 6,
    item: "数据服务费",
    kind: "special",
  },
  html: page(`
    <h1>电子发票（增值税专用发票）</h1>
    <div class="hdr"><span>发票号码：25322000000122334455</span><span>开票日期：2026年10月26日</span></div>
    <div class="block">购买方信息　名称：南京数联智能科技有限公司　纳税人识别号：91320100MA1ABCDE12</div>
    <div class="block">销售方信息　名称：杭州云启数据服务有限公司　纳税人识别号：91330100MA2FGHIJ34</div>
    <div class="block" style="border:0;padding:0;font-size:10px">开具红字发票信息表编号：1234567890123456</div>
    <table>
      <tr><th style="width:34%">项目名称</th><th>单位</th><th class="r">数量</th><th class="r">金额</th><th class="r">税率</th><th class="r">税额</th></tr>
      <tr><td>*信息技术服务*数据服务费</td><td>项</td><td class="r">-1</td><td class="r">-100000.00</td><td class="r">6%</td><td class="r">-6000.00</td></tr>
      <tr><td class="r" colspan="3">合　计</td><td class="r">-100000.00</td><td></td><td class="r">-6000.00</td></tr>
    </table>
    <div class="hdr" style="margin-top:8px"><span>价税合计（大写）负数壹拾万陆仟圆整</span><span>（小写）-106000.00</span></div>
  `),
});

/** 16. 没有「合计」行，只有价税合计（少数开票软件的输出） */
FIXTURES.push({
  file: "16-无合计行.pdf",
  expect: {
    number: "25322000000133445566",
    date: "2026-10-12",
    seller: "无锡灵犀智能制造有限公司",
    total: 331800,
    rate: 6,
    item: "软件开发服务",
  },
  html: page(`
    <h1>电子发票（增值税专用发票）</h1>
    <div class="hdr"><span>发票号码：25322000000133445566</span><span>开票日期：2026年10月12日</span></div>
    <div class="block">购买方信息　名称：南京数联智能科技有限公司　纳税人识别号：91320100MA1ABCDE12</div>
    <div class="block">销售方信息　名称：无锡灵犀智能制造有限公司　纳税人识别号：91320200MA1QWERT77</div>
    <table>
      <tr><th style="width:40%">项目名称</th><th>单位</th><th class="r">数量</th><th class="r">金额</th><th class="r">税率</th><th class="r">税额</th></tr>
      <tr><td>*信息技术服务*软件开发服务</td><td>项</td><td class="r">1</td><td class="r">313018.87</td><td class="r">6%</td><td class="r">18781.13</td></tr>
    </table>
    <div class="hdr" style="margin-top:8px"><span>价税合计（大写）叁拾叁万壹仟捌佰圆整</span><span>（小写）¥331800.00</span></div>
  `),
});

/** 17. 无税率列（只有金额与税额，需按税率反推） */
FIXTURES.push({
  file: "17-无税率列.pdf",
  expect: {
    number: "25322000000144556677",
    date: "2026-09-05",
    seller: "常州天合储能科技有限公司",
    amount: 526000,
    tax: 68380,
    total: 594380,
    rate: 13,
    item: "智能硬件销售",
  },
  html: page(`
    <h1>电子发票（增值税专用发票）</h1>
    <div class="hdr"><span>发票号码：25322000000144556677</span><span>开票日期：2026年09月05日</span></div>
    <div class="block">购买方信息　名称：南京数联智能科技有限公司　纳税人识别号：91320100MA1ABCDE12</div>
    <div class="block">销售方信息　名称：常州天合储能科技有限公司　纳税人识别号：91320400MA1TRETY88</div>
    <table>
      <tr><th style="width:44%">项目名称</th><th>单位</th><th class="r">数量</th><th class="r">金额</th><th class="r">税额</th></tr>
      <tr><td>*电子设备*智能硬件销售</td><td>批</td><td class="r">1</td><td class="r">526000.00</td><td class="r">68380.00</td></tr>
      <tr><td class="r" colspan="3">合　计</td><td class="r">¥526000.00</td><td class="r">¥68380.00</td></tr>
    </table>
    <div class="hdr" style="margin-top:8px"><span>价税合计（大写）伍拾玖万肆仟叁佰捌拾圆整</span><span>（小写）¥594380.00</span></div>
  `),
});

/** 18. 购销方用表头而不是「名称：」标签（部分开票软件导出） */
FIXTURES.push({
  file: "18-无名称标签.pdf",
  expect: {
    number: "25322000000155667788",
    date: "2026-10-06",
    seller: "南京本地生活网络科技有限公司",
    amount: 68000,
    tax: 4080,
    total: 72080,
    rate: 6,
    item: "数据服务",
  },
  html: page(`
    <h1>电子发票（普通发票）</h1>
    <div class="hdr"><span>发票号码：25322000000155667788</span><span>开票日期：2026年10月06日</span></div>
    <table>
      <tr><th style="width:12%">购买方</th><td>南京数联智能科技有限公司</td><th style="width:12%">销售方</th><td>南京本地生活网络科技有限公司</td></tr>
    </table>
    <table>
      <tr><th style="width:40%">项目名称</th><th>单位</th><th class="r">数量</th><th class="r">金额</th><th class="r">税率</th><th class="r">税额</th></tr>
      <tr><td>*信息技术服务*数据服务</td><td>项</td><td class="r">1</td><td class="r">68000.00</td><td class="r">6%</td><td class="r">4080.00</td></tr>
      <tr><td class="r" colspan="3">合　计</td><td class="r">¥68000.00</td><td></td><td class="r">¥4080.00</td></tr>
    </table>
    <div class="hdr" style="margin-top:8px"><span>价税合计（大写）柒万贰仟零捌拾圆整</span><span>（小写）¥72080.00</span></div>
  `),
});

/** 19. 字符零间距（转曲导出，列与列之间没有任何空隙） */
FIXTURES.push({
  file: "19-零间距.pdf",
  expect: {
    number: "25322000000166778899",
    date: "2026-10-19",
    seller: "南京星海办公用品有限公司",
    amount: 3000,
    tax: 390,
    total: 3390,
    rate: 13,
  },
  html: page(`
    <style>
      body { padding: 14px; }
      .z { margin: 0; padding: 0; line-height: 1.5; font-size: 10px; }
      .z span { margin: 0; padding: 0; }
      .cols { display: flex; }
      .cols span { font-size: 10px; }
    </style>
    <div class="z"><span>电子发票（增值税专用发票）</span></div>
    <div class="cols"><span>发票号码：25322000000166778899</span><span>开票日期：2026年10月19日</span></div>
    <div class="z"><span>购买方信息名称：</span><span>南京数联智能科技有限公司</span></div>
    <div class="z"><span>销售方信息名称：</span><span>南京星海办公用品有限公司</span></div>
    <div class="cols"><span>*纸制品*复印纸</span><span>箱</span><span>10</span><span>3000.00</span><span>13%</span><span>390.00</span></div>
    <div class="cols"><span>合计</span><span>3000.00</span><span>390.00</span></div>
    <div class="cols"><span>价税合计（大写）叁仟叁佰玖拾圆整</span><span>（小写）¥3390.00</span></div>
  `),
});

/** 20. 铁路电子客票（没有「价税合计」字样，只有票价） */
FIXTURES.push({
  file: "20-铁路客票.pdf",
  expect: {
    number: "26117000000012345678",
    date: "2026-10-09",
    seller: "中国铁路上海局集团有限公司",
    total: 553,
    rate: 9,
    item: "铁路旅客运输",
  },
  html: page(`
    <h1>电子发票（铁路电子客票）</h1>
    <div class="hdr"><span>发票号码：26117000000012345678</span><span>开票日期：2026年10月09日</span></div>
    <div class="block">购买方信息　名称：南京数联智能科技有限公司　统一社会信用代码/纳税人识别号：91320100MA1ABCDE12</div>
    <div class="block">销售方信息　名称：中国铁路上海局集团有限公司　统一社会信用代码/纳税人识别号：91310000100001234X</div>
    <table>
      <tr><th>项目名称</th><th>车次</th><th>出发站</th><th>到达站</th><th>乘车日期</th><th class="r">票价</th><th class="r">税率</th><th class="r">税额</th></tr>
      <tr><td>铁路旅客运输</td><td>G1234</td><td>南京南</td><td>上海虹桥</td><td>2026-10-09</td><td class="r">553.00</td><td class="r">9%</td><td class="r">45.66</td></tr>
    </table>
    <div class="hdr" style="margin-top:8px"><span>票价合计：¥553.00</span><span>税额合计：¥45.66</span></div>
  `),
});

/** 21. 纯图片 PDF（无文字层、无二维码）—— 必须明确失败并引导手工录入 */
FIXTURES.push({
  file: "21-图片无二维码.pdf",
  expect: { reject: true },
  shot: true,
  html: page(`
    <h1>电子发票（增值税专用发票）</h1>
    <div class="hdr"><span>发票号码：25322000000177889900</span><span>开票日期：2026年10月28日</span></div>
    <div class="block">购买方信息　名称：南京数联智能科技有限公司</div>
    <div class="block">销售方信息　名称：上海寅晟贸易有限公司</div>
    <table>
      <tr><th style="width:40%">项目名称</th><th class="r">金额</th><th class="r">税率</th><th class="r">税额</th></tr>
      <tr><td>*技术服务*技术服务费</td><td class="r">15000.00</td><td class="r">6%</td><td class="r">900.00</td></tr>
      <tr><td class="r">合　计</td><td class="r">¥15000.00</td><td></td><td class="r">¥900.00</td></tr>
    </table>
    <div class="hdr" style="margin-top:8px"><span>价税合计（大写）壹万伍仟玖佰圆整</span><span>（小写）¥15900.00</span></div>
  `),
});

/* ------------------------------------------------------------------ */
/* 渲染                                                                */
/* ------------------------------------------------------------------ */

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--no-sandbox"] });
  const p = await browser.newPage();
  const manifest = [];
  for (const f of FIXTURES) {
    await p.setContent(f.html, { waitUntil: "networkidle" });
    if (f.shot) {
      // 先截成图片，再把图片放进 PDF：模拟扫描件（无文字层、无二维码）
      const png = await p.screenshot({ fullPage: true });
      const b64 = png.toString("base64");
      await p.setContent(
        `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}img{width:100%}</style></head><body><img src="data:image/png;base64,${b64}"></body></html>`,
        { waitUntil: "networkidle" },
      );
    }
    await p.pdf({ path: path.join(OUT, f.file), format: "A4", printBackground: true, margin: { top: "10mm", bottom: "10mm", left: "8mm", right: "8mm" } });
    manifest.push({ file: f.file, expect: f.expect });
    console.log("生成", f.file);
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, "expected.json"), JSON.stringify(manifest, null, 2), "utf8");
  console.log("共", manifest.length, "份 →", OUT);
})();
