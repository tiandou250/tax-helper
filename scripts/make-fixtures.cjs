/**
 * 生成四种格式的发票测试样本（不入库，只在本地验证用）。
 * node scripts/make-fixtures.cjs
 */
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");
const QRCode = require("qrcode");
const { chromium } = require("playwright-core");

const OUT = "D:/file/temp/fixtures";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<EInvoice>
  <Header>
    <InherentLabel>
      <InIssuType><LabelCode>01</LabelCode><LabelName>增值税专用发票</LabelName></InIssuType>
    </InherentLabel>
    <GeneralInfo>
      <InvoiceNumber>25322000000098765432</InvoiceNumber>
      <IssueTime>2026-10-12</IssueTime>
      <TotalAmWithoutTax>240000.00</TotalAmWithoutTax>
      <TotalTaxAm>14400.00</TotalTaxAm>
      <TotalTax-includedAmount>254400.00</TotalTax-includedAmount>
    </GeneralInfo>
    <SellerInfo>
      <SellerName>杭州云启数据服务有限公司</SellerName>
    </SellerInfo>
    <BuyerInfo>
      <BuyerName>南京数联智能科技有限公司</BuyerName>
    </BuyerInfo>
  </Header>
  <EInvoiceData>
    <SellersSubject>
      <IssuItemInformation>
        <ItemName>数据服务费</ItemName>
        <TaxRate>0.06</TaxRate>
      </IssuItemInformation>
    </SellersSubject>
  </EInvoiceData>
</EInvoice>`;

const INV = {
  number: "25322000000012345678",
  date: "2026年10月08日",
  buyer: "南京数联智能科技有限公司",
  seller: "苏州工业园区智远供应链有限公司",
  item: "软件开发服务",
  amount: "100000.00",
  tax: "6000.00",
  total: "106000.00",
  rate: "6%",
};

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:"Microsoft YaHei",sans-serif;font-size:13px;padding:24px;color:#000}
h1{font-size:18px;text-align:center;letter-spacing:4px}
table{width:100%;border-collapse:collapse;margin-top:8px}
td{border:1px solid #666;padding:6px}
.r{text-align:right}
</style></head><body>
<h1>电子发票（增值税专用发票）</h1>
<table>
<tr><td>发票号码：${INV.number}</td><td>开票日期：${INV.date}</td></tr>
<tr><td>购买方信息 名称：${INV.buyer}</td><td>销售方信息 名称：${INV.seller}</td></tr>
<tr><td>项目名称：${INV.item}</td><td class="r">税率/征收率：${INV.rate}</td></tr>
<tr><td class="r">合计</td><td class="r">¥${INV.amount}　¥${INV.tax}</td></tr>
<tr><td class="r">价税合计（大写）壹拾万零陆仟圆整</td><td class="r">（小写）¥${INV.total}</td></tr>
</table>
</body></html>`;

const ofdContent = `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
  <ofd:Content>
    <ofd:Layer>
      <ofd:TextObject ID="1" Boundary="20 40 200 113">
        <ofd:TextCode X="30" Y="52" DeltaX="0">电子发票（普通发票）</ofd:TextCode>
        <ofd:TextCode X="30" Y="80" DeltaX="0">发票号码：25322000000055556666</ofd:TextCode>
        <ofd:TextCode X="200" Y="80" DeltaX="0">开票日期：2026年09月18日</ofd:TextCode>
        <ofd:TextCode X="30" Y="100" DeltaX="0">购买方信息 名称：南京数联智能科技有限公司</ofd:TextCode>
        <ofd:TextCode X="30" Y="120" DeltaX="0">销售方信息 名称：无锡灵犀智能制造有限公司</ofd:TextCode>
        <ofd:TextCode X="30" Y="140" DeltaX="0">项目名称：系统集成服务</ofd:TextCode>
        <ofd:TextCode X="200" Y="140" DeltaX="0">税率/征收率：6%</ofd:TextCode>
        <ofd:TextCode X="30" Y="160" DeltaX="0">合计</ofd:TextCode>
        <ofd:TextCode X="200" Y="160" DeltaX="0">¥198000.00 ¥11880.00</ofd:TextCode>
        <ofd:TextCode X="30" Y="180" DeltaX="0">价税合计（小写）¥209880.00</ofd:TextCode>
      </ofd:Layer>
    </ofd:Content>
  </ofd:Page>
</ofd:Page>`.replace(/<\/ofd:Page>$/, "</ofd:Page>");

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  fs.writeFileSync(path.join(OUT, "sample-数电票.xml"), XML, "utf8");

  const zip = new JSZip();
  zip.file("OFD.xml", `<?xml version="1.0"?><ofd:OFD xmlns:ofd="http://www.ofdspec.org/2016" DocBody="x"/>`);
  zip.file("Doc_0/Document.xml", `<?xml version="1.0"?><ofd:Document/>`);
  zip.file("Doc_0/Pages/Page_0/Content.xml", ofdContent);
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  fs.writeFileSync(path.join(OUT, "sample-电子发票.ofd"), buf);

  await QRCode.toFile(
    path.join(OUT, "sample-发票照片.png"),
    "01,32,,25322000000077778888,88000.00,20261020,,",
    { width: 720, margin: 1 },
  );

  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.pdf({ path: path.join(OUT, "sample-电子发票.pdf"), format: "A4", printBackground: true });
  await browser.close();

  for (const f of fs.readdirSync(OUT)) {
    console.log(f, (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(1) + " KB");
  }
})();
