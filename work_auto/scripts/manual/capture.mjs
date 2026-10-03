/**
 * 사용 매뉴얼 스크린샷 찍기 (docs/MANUAL.md)
 *
 *   npm run build && npx next start -p 3000   ← 데모 모드 서버 (Supabase·AI 키 없이)
 *   npm run manual:capture                    ← 전체
 *   npm run manual:capture -- 05-yt-form      ← 일부만 (id)
 *
 * - 화면은 public/manual/shots/{id}.png, 강조 위치(번호별 상자)는 lib/manual/shots.json 에 저장한다
 * - 강조 위치는 화면 요소의 실제 좌표라 화면이 바뀌어도 다시 찍으면 맞는다
 * - 데모 표시(데모 관리자, Mock 안내)는 찍기 전에 가린다
 */
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { SHOTS } from "./shots.mjs";

const BASE = process.env.MANUAL_BASE_URL ?? "http://localhost:3000";
const PUBLIC = process.env.MANUAL_PUBLIC_URL ?? "https://work-auto-blush.vercel.app";
const ROOT = path.resolve(import.meta.dirname, "../..");
const IMG_DIR = path.join(ROOT, "public/manual/shots");
const JSON_PATH = path.join(ROOT, "lib/manual/shots.json");
const SCALE = 1.5;

/** 데모 표시를 가리고 이름을 바꾼다 (매뉴얼용 화면) */
async function cleanDemo(page) {
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      if (n.nodeValue.includes("데모 관리자")) n.nodeValue = n.nodeValue.replaceAll("데모 관리자", "김지니");
      if (n.nodeValue.trim() === "데모 모드") n.nodeValue = "";
    }
    // 데모 예시 문장에 붙는 시각 표시
    for (const el of document.querySelectorAll("input, textarea")) {
      if (el.value === "데모 관리자") el.value = "김지니";
      if (/ · 데모 \d/.test(el.value)) el.value = el.value.replace(/ · 데모 \d.*$/, "");
    }
    const hide = (el) => el && (el.style.visibility = "hidden");
    for (const el of document.querySelectorAll("p, span, div")) {
      const t = el.textContent ?? "";
      if (!el.querySelector("a") && el.children.length <= 2 && /Mock 모드로 실행 중/.test(t) && t.length < 40) hide(el);
      if (/지금은 데모\(Mock\)|데모\(Mock\) 데이터|데모 모드에서는|Mock\) 문장/.test(t) && t.length < 300) {
        const box = el.closest("[class*='rounded']");
        if (box && (box.textContent ?? "").length < 300) box.style.display = "none";
      }
    }
  });
}

async function box(locator, clipOrigin, pad) {
  const target = locator.filter({ visible: true }).first();
  await target.waitFor({ state: "visible", timeout: 8000 });
  const b = await target.boundingBox();
  if (!b) return null;
  return {
    x: Math.round(b.x - clipOrigin.x - pad),
    y: Math.round(b.y - clipOrigin.y - pad),
    w: Math.round(b.width + pad * 2),
    h: Math.round(b.height + pad * 2),
  };
}

async function main() {
  const only = new Set(process.argv.slice(2));
  const list = only.size ? SHOTS.filter((s) => only.has(s.id)) : SHOTS;
  if (!list.length) throw new Error("찍을 화면이 없습니다: " + [...only].join(", "));
  await fs.mkdir(IMG_DIR, { recursive: true });
  const meta = JSON.parse(await fs.readFile(JSON_PATH, "utf8").catch(() => "{}"));
  const browser = await chromium.launch();

  for (const shot of list) {
    const viewport = shot.viewport ?? { width: 1280, height: 800 };
    const context = await browser.newContext({ viewport, deviceScaleFactor: SCALE, locale: "ko-KR", timezoneId: "Asia/Seoul" });
    const page = await context.newPage();
    try {
      await page.goto((shot.public ? PUBLIC : BASE) + shot.url, { waitUntil: "networkidle" });
      await page.waitForTimeout(shot.wait ?? 800);
      if (shot.prepare) await shot.prepare(page);
      await page.waitForTimeout(400);
      await cleanDemo(page);
      if (shot.scrollTo) {
        await shot.scrollTo(page).first().evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 24));
        await page.waitForTimeout(300);
      } else if (!shot.clip) {
        // 입력·선택하면서 스크롤이 움직였을 수 있다 → 맨 위에서 찍는다
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(200);
      }
      // 찍을 영역: 요소(clip) 또는 화면 전체
      let clip = { x: 0, y: 0, width: viewport.width, height: viewport.height };
      if (shot.clip) {
        // clip 은 지금 화면(viewport) 기준이라, 요소를 화면 위쪽으로 올린 뒤 화면 안에서 자른다
        const target = shot.clip(page).first();
        const m = shot.clipPad ?? 12;
        if (!shot.scrollTo) {
          await target.evaluate((el, margin) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - margin), m);
          await page.waitForTimeout(300);
        }
        const b = await target.boundingBox();
        // 요소 상자와 화면이 겹치는 부분만
        const x = Math.max(0, b.x - m);
        const y = Math.max(0, b.y - m);
        const right = Math.min(viewport.width, b.x + b.width + m);
        const bottom = Math.min(viewport.height, b.y + b.height + m);
        clip = { x, y, width: right - x, height: bottom - y };
      }
      const boxes = [];
      for (const [n, get] of Object.entries(shot.marks ?? {})) {
        const b = await box(get(page), clip, shot.markPad ?? 6).catch((e) => {
          throw new Error(`${shot.id}: ${n}번 강조 대상을 찾지 못했습니다 (${e.message.split("\n")[0]})`);
        });
        if (!b) throw new Error(`${shot.id}: ${n}번 강조 대상을 찾지 못했습니다`);
        // 여백 때문에 살짝 넘친 것은 화면 가장자리에 맞추고, 많이 넘치면 알린다
        if (b.y < -10 || b.x < -10 || b.y + b.h > clip.height + 10 || b.x + b.w > clip.width + 10) console.warn(`  ! ${shot.id}: ${n}번 강조가 화면 밖에 걸칩니다`);
        const x = Math.max(1, b.x);
        const y = Math.max(1, b.y);
        boxes.push({ n: Number(n), x, y, w: Math.min(b.x + b.w, clip.width - 1) - x, h: Math.min(b.y + b.h, clip.height - 1) - y });
      }
      await page.mouse.move(viewport.width - 2, viewport.height - 2);
      await page.waitForTimeout(150);
      const file = `${shot.id}.png`;
      await page.screenshot({ path: path.join(IMG_DIR, file), clip, animations: "disabled" });
      meta[shot.id] = { file: `/manual/shots/${file}`, w: Math.round(clip.width), h: Math.round(clip.height), boxes };
      console.log("✓", shot.id, boxes.length ? `(강조 ${boxes.length})` : "");
    } catch (e) {
      console.error("✗", shot.id, e.message.split("\n")[0]);
      process.exitCode = 1;
    } finally {
      await context.close();
    }
  }
  await browser.close();
  const sorted = Object.fromEntries(Object.entries(meta).sort(([a], [b]) => a.localeCompare(b)));
  await fs.writeFile(JSON_PATH, JSON.stringify(sorted, null, 2) + "\n");
}

main();
