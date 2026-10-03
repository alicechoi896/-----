/**
 * 사용 매뉴얼 PDF 만들기 (docs/MANUAL.md)
 *   데모 서버를 띄운 상태에서: npm run manual:pdf
 * /manual-print 화면을 A4 가로 PDF 로 저장한다 → public/manual/jadonghwa-genie-manual.pdf
 */
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.MANUAL_BASE_URL ?? "http://localhost:3000";
const OUT = path.resolve(import.meta.dirname, "../../public/manual/jadonghwa-genie-manual.pdf");

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${BASE}/manual-print`, { waitUntil: "networkidle" });
// 이미지가 모두 그려질 때까지
await page.evaluate(async () => {
  await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
  await document.fonts.ready;
});
// 한 쪽(A4 가로 본문 높이)을 넘는 절은 그 절의 스크린샷만 조금씩 줄인다
await page.emulateMedia({ media: "print" });
await page.setViewportSize({ width: 1024, height: 800 });
const shrunk = await page.evaluate(() => {
  const limit = (186 * 96) / 25.4;
  let n = 0;
  for (const sec of document.querySelectorAll(".manual-page")) {
    const shot = sec.querySelector("[data-shot]");
    if (!shot) continue;
    let guard = 0;
    while (sec.getBoundingClientRect().height > limit && guard++ < 40) {
      shot.style.maxWidth = shot.getBoundingClientRect().width * 0.95 + "px";
      n++;
    }
  }
  return n;
});
if (shrunk) console.log("· 넘치는 절 이미지 줄임:", shrunk, "단계");
await page.pdf({
  path: OUT,
  preferCSSPageSize: true,
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate:
    '<div style="width:100%;font-size:8px;color:#8a909c;padding:0 12mm;display:flex;justify-content:space-between;font-family:sans-serif">' +
    '<span>자동화 지니 사용 매뉴얼</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
});
await browser.close();
console.log("✓", path.relative(process.cwd(), OUT));
