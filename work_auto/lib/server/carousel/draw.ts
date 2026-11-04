import "server-only";
import path from "node:path";
import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import { accentSegments, parseLines, type CarouselDesign, type CarouselSlide } from "@/lib/carousel/types";
import { CAPTION_FONTS } from "@/lib/video-production/config";
import { fontFamilyOf } from "../video/text-image";

/**
 * 캐러셀 한 장 그리기 (v0.9.173) — 1080×1350 PNG, 외부 비용 없음.
 * 글자는 여기서 직접 그린다 (AI 그림에 한글을 맡기면 틀리기 쉬워서). 그림은 imageKey 사진을 받아 넣기만.
 * 레퍼런스: 어두운 바탕 + 'WARNING' 테두리 태그 + 아주 굵은 큰 제목(강조색 단어) + 머리말 줄 + 카드·말풍선 상자
 */
export const CW = 1080;
export const CH = 1350;
const PAD = 80;
const PRET = path.join(process.cwd(), "node_modules", "pretendard", "dist", "public", "static");
let ready = false;
function fonts() {
  if (ready) return;
  GlobalFonts.registerFromPath(path.join(PRET, "Pretendard-Black.otf"), "car_black");
  GlobalFonts.registerFromPath(path.join(PRET, "Pretendard-Bold.otf"), "car_bold");
  GlobalFonts.registerFromPath(path.join(PRET, "Pretendard-Medium.otf"), "car_med");
  ready = true;
}

type Img = Awaited<ReturnType<typeof loadImage>>;
interface Ctx {
  g: SKRSContext2D;
  d: CarouselDesign;
  title: string;
  muted: string;
  faint: string;
  line: string;
}

/** #RRGGBB + 투명도 */
function alpha(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return `rgba(255,255,255,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
const isHex = (c: string) => /^#[0-9a-f]{6}$/i.test(c);

/** 글자 사이 띄우기 (태그·머리말) */
function spaced(g: SKRSContext2D, text: string, x: number, y: number, sp: number, align: "left" | "right" = "left"): number {
  const w = [...text].reduce((n, ch) => n + g.measureText(ch).width + sp, -sp);
  let cx = align === "right" ? x - w : x;
  g.textAlign = "left";
  for (const ch of text) {
    g.fillText(ch, cx, y);
    cx += g.measureText(ch).width + sp;
  }
  return w;
}

/** 넓이를 넘으면 띄어쓰기 단위로, 그래도 넘으면 글자 단위로 줄 나누기 (강조 표시 *…* 는 지키며) */
function wrapRich(g: SKRSContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  const plainW = (s: string) => g.measureText(s.replace(/\*/g, "")).width;
  for (const para of text.split("\n")) {
    if (!para.trim()) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(/(\s+)/)) {
      const next = line + word;
      if (plainW(next) <= maxW || !line.trim()) {
        if (plainW(next) <= maxW) line = next;
        else {
          // 한 단어가 너무 길면 글자 단위
          for (const ch of word) {
            if (plainW(line + ch) > maxW && line) {
              out.push(line.trimEnd());
              line = ch;
            } else line += ch;
          }
        }
      } else {
        out.push(line.trimEnd());
        line = word.trimStart();
      }
    }
    if (line.trim()) out.push(line.trimEnd());
  }
  // 줄을 넘어간 강조(*…*)를 줄마다 다시 닫기
  let open = false;
  return out.map((l) => {
    const s = (open ? "*" : "") + l;
    const n = (l.match(/\*/g) ?? []).length;
    if (n % 2 === 1) open = !open;
    return open ? `${s}*` : s;
  });
}

/** 강조색이 섞인 한 줄 */
function richLine(c: Ctx, line: string, x: number, y: number, color: string, align: "left" | "center" = "left") {
  const g = c.g;
  const segs = accentSegments(line);
  const total = segs.reduce((n, s) => n + g.measureText(s.text).width, 0);
  let cx = align === "center" ? x - total / 2 : x;
  g.textAlign = "left";
  for (const s of segs) {
    g.fillStyle = s.accent ? c.d.accent : color;
    g.fillText(s.text, cx, y);
    cx += g.measureText(s.text).width;
  }
}

/** 큰 제목: 가장 넓은 줄이 맞을 때까지 줄이고, 최소 크기에서도 넘으면 줄 나누기. 그린 높이를 돌려준다 */
function bigTitle(c: Ctx, text: string, x: number, y: number, maxW: number, size: number, min: number, maxLines = 5, align: "left" | "center" = "left", color?: string): number {
  if (!text.trim()) return 0;
  const g = c.g;
  const fam = c.title;
  let s = size;
  const widest = () => Math.max(...text.split("\n").map((l) => g.measureText(l.replace(/\*/g, "")).width));
  for (; s > min; s -= 4) {
    g.font = `${s}px ${fam}`;
    if (widest() <= maxW) break;
  }
  g.font = `${s}px ${fam}`;
  const lines = wrapRich(g, text, maxW).slice(0, maxLines);
  const lh = Math.round(s * 1.14);
  g.textBaseline = "top";
  lines.forEach((l, i) => richLine(c, l, x, y + i * lh, color ?? c.d.fg, align));
  return lines.length * lh;
}

/** 본문 글 (강조 가능). 그린 높이 */
function bodyText(c: Ctx, text: string, x: number, y: number, maxW: number, size: number, color: string, font = "car_med", maxLines = 8, align: "left" | "center" = "left"): number {
  if (!text.trim()) return 0;
  const g = c.g;
  g.font = `${size}px ${font}`;
  g.textBaseline = "top";
  const lines = wrapRich(g, text, maxW).slice(0, maxLines);
  const lh = Math.round(size * 1.5);
  lines.forEach((l, i) => richLine(c, l, x, y + i * lh, color, align));
  return lines.length * lh;
}

function roundRect(g: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/** 사진을 칸에 꽉 채우기 (cover) */
function cover(g: SKRSContext2D, img: Img, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s);
  g.restore();
}

function background(c: Ctx, glow = true) {
  const { g, d } = c;
  g.fillStyle = d.bg;
  g.fillRect(0, 0, CW, CH);
  if (d.theme === "warning" && glow) {
    // 아래쪽에서 올라오는 강조색 빛 + 가장자리 어둡게
    const r = g.createRadialGradient(CW * 0.55, CH * 0.95, 40, CW * 0.55, CH * 0.95, CH * 0.85);
    r.addColorStop(0, alpha(d.accent, 0.32));
    r.addColorStop(1, alpha(d.accent, 0));
    g.fillStyle = r;
    g.fillRect(0, 0, CW, CH);
  } else if (d.theme === "note") {
    g.strokeStyle = alpha(d.fg, 0.07);
    g.lineWidth = 2;
    for (let y = 170; y < CH; y += 64) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(CW, y);
      g.stroke();
    }
  }
}

/** 위쪽 머리말 줄 (머리말 · 오른쪽 표시 · 점선) — 표지가 아닐 때. 다음 y */
function headerRow(c: Ctx): number {
  const { g, d } = c;
  if (!d.header && !d.badge) return PAD;
  g.textBaseline = "top";
  g.font = `28px car_med`;
  g.fillStyle = c.muted;
  if (d.header) spaced(g, d.header, PAD, 64, 3);
  if (d.badge) {
    g.font = `28px car_bold`;
    g.fillStyle = d.accent;
    spaced(g, d.badge.toUpperCase(), CW - PAD, 64, 4, "right");
  }
  g.strokeStyle = c.line;
  g.lineWidth = 2;
  g.setLineDash([10, 8]);
  g.beginPath();
  g.moveTo(PAD, 118);
  g.lineTo(CW - PAD, 118);
  g.stroke();
  g.setLineDash([]);
  return 160;
}

/** 테두리 태그 (WARNING 같은). 높이 */
function tagBox(c: Ctx, tag: string, x: number, y: number): number {
  if (!tag.trim()) return 0;
  const { g, d } = c;
  g.font = `32px car_bold`;
  g.textBaseline = "middle";
  const t = tag.toUpperCase();
  const w = [...t].reduce((n, ch) => n + g.measureText(ch).width + 6, -6) + 44;
  const h = 62;
  g.strokeStyle = d.accent;
  g.lineWidth = 3;
  g.strokeRect(x, y, w, h);
  g.fillStyle = d.accent;
  spaced(g, t, x + 22, y + h / 2 + 1, 6);
  g.textBaseline = "top";
  return h;
}

function pageNo(c: Ctx, i: number, n: number, top: boolean) {
  if (!c.d.pageNo || n < 2) return;
  const g = c.g;
  g.font = `30px car_med`;
  g.textBaseline = "top";
  g.fillStyle = c.d.theme === "photo" ? "rgba(255,255,255,0.9)" : c.muted;
  g.textAlign = "right";
  g.fillText(`${i + 1}/${n}`, CW - 60, top ? 52 : CH - 80);
  g.textAlign = "left";
}

/** 남은 자리에 그림 (위쪽은 바탕색으로 스며들게) */
function imageBelow(c: Ctx, img: Img | null, y: number, fade = true) {
  if (!img || y > CH - 200) return;
  const g = c.g;
  cover(g, img, 0, y, CW, CH - y);
  if (fade) {
    const fadeH = Math.min(360, (CH - y) * 0.6);
    const gr = g.createLinearGradient(0, y, 0, y + fadeH);
    gr.addColorStop(0, alpha(c.d.bg, 1));
    gr.addColorStop(0.55, alpha(c.d.bg, 0.55));
    gr.addColorStop(1, alpha(c.d.bg, 0));
    g.fillStyle = gr;
    g.fillRect(0, y - 1, CW, fadeH + 1);
  }
}

/** 상자 (카드) */
function card(c: Ctx, x: number, y: number, w: number, h: number, hot: boolean) {
  const g = c.g;
  roundRect(g, x, y, w, h, 18);
  g.fillStyle = hot ? alpha(c.d.accent, 0.08) : c.faint;
  g.fill();
  g.strokeStyle = hot ? c.d.accent : c.line;
  g.lineWidth = hot ? 3 : 2;
  g.stroke();
}

/** 카드 장: '라벨: 내용' 줄마다 상자 (마지막 상자는 강조) */
function drawCards(c: Ctx, raw: string, y: number) {
  const g = c.g;
  const items = parseLines(raw).slice(0, 5);
  if (!items.length) return;
  const gap = 26;
  const avail = CH - y - 90;
  const each = Math.min(300, (avail - gap * (items.length - 1)) / items.length);
  items.forEach((it, k) => {
    const top = y + k * (each + gap);
    const hot = k === items.length - 1 && items.length > 1;
    card(c, PAD, top, CW - PAD * 2, each, hot);
    let ty = top + 30;
    if (it.label) {
      g.fillStyle = hot ? c.d.accent : c.muted;
      g.beginPath();
      g.arc(PAD + 40, ty + 16, 8, 0, Math.PI * 2);
      g.fill();
      g.font = `30px car_bold`;
      g.textBaseline = "top";
      g.fillText(it.label, PAD + 60, ty);
      ty += 54;
    }
    bodyText(c, it.text, PAD + 32, ty, CW - PAD * 2 - 64, it.label ? 40 : 44, c.d.fg, "car_bold", Math.max(1, Math.floor((each - (ty - top) - 20) / 60)));
  });
}

/** 말풍선 장: '라벨:'(구역) · 나: · 상대: · 결과: */
function drawChat(c: Ctx, raw: string, y: number) {
  const g = c.g;
  const items = parseLines(raw).slice(0, 10);
  let cy = y;
  const maxBubble = CW - PAD * 2 - 140;
  for (const it of items) {
    if (cy > CH - 140) break;
    if (it.kind === "item") {
      // 구역 제목 (● 막말하면)
      g.fillStyle = c.muted;
      g.beginPath();
      g.arc(PAD + 10, cy + 18, 8, 0, Math.PI * 2);
      g.fill();
      g.font = `32px car_bold`;
      g.textBaseline = "top";
      g.fillText((it.label ? `${it.label} ${it.text}` : it.text).trim().replace(/[:：]$/, ""), PAD + 32, cy);
      cy += 70;
      continue;
    }
    if (it.kind === "result") {
      g.font = `40px car_bold`;
      const lines = wrapRich(g, it.text, CW - PAD * 2 - 80).slice(0, 3);
      const h = 60 + lines.length * 56;
      roundRect(g, PAD, cy, CW - PAD * 2, h, 14);
      g.fillStyle = alpha(c.d.accent, 0.1);
      g.fill();
      g.strokeStyle = c.d.accent;
      g.lineWidth = 3;
      g.stroke();
      g.textBaseline = "middle";
      lines.forEach((l, i) => richLine(c, l, PAD + 40, cy + 30 + 28 + i * 56, c.d.accent));
      g.textBaseline = "top";
      cy += h + 34;
      continue;
    }
    // 말풍선: 나 = 오른쪽, 상대 = 왼쪽
    g.font = `40px car_bold`;
    const lines = wrapRich(g, it.text, maxBubble - 60).slice(0, 3);
    const w = Math.min(maxBubble, Math.max(...lines.map((l) => g.measureText(l.replace(/\*/g, "")).width)) + 64);
    const h = 40 + lines.length * 56;
    const x = it.kind === "me" ? CW - PAD - w : PAD;
    roundRect(g, x, cy, w, h, h / 2 > 44 ? 32 : h / 2);
    g.fillStyle = it.kind === "me" ? alpha(c.d.fg, 0.14) : alpha(c.d.fg, 0.07);
    g.fill();
    g.textBaseline = "middle";
    lines.forEach((l, i) => richLine(c, l, x + 32, cy + 20 + 28 + i * 56, c.d.fg));
    g.textBaseline = "top";
    cy += h + 26;
  }
}

/** 목록 장: 번호 동그라미 + 글 */
function drawList(c: Ctx, raw: string, y: number) {
  const g = c.g;
  const items = parseLines(raw).slice(0, 7);
  if (!items.length) return;
  const avail = CH - y - 120;
  const each = Math.min(230, avail / items.length);
  const y0 = y + Math.max(0, (avail - each * items.length) / 3);
  items.forEach((it, k) => {
    const top = y0 + k * each;
    g.fillStyle = c.d.accent;
    g.beginPath();
    g.arc(PAD + 30, top + 34, 30, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = c.d.theme === "warning" || c.d.theme === "photo" ? "#111111" : "#FFFFFF";
    g.font = `34px car_black`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(k + 1), PAD + 30, top + 36);
    g.textAlign = "left";
    g.textBaseline = "top";
    const text = it.label ? `*${it.label}* ${it.text}` : it.text;
    bodyText(c, text, PAD + 90, top + 6, CW - PAD * 2 - 90, 46, c.d.fg, "car_bold", Math.max(1, Math.floor((each - 20) / 69)));
  });
}

/** 사진 위 글 (예전 제품 캐러셀과 같은 느낌) */
function drawPhoto(c: Ctx, s: CarouselSlide, img: Img | null, first: boolean) {
  const g = c.g;
  if (img) cover(g, img, 0, 0, CW, CH);
  const size = first ? 92 : 68;
  g.font = `${size}px ${c.title}`;
  const lines = wrapRich(g, [s.title, s.body].filter(Boolean).join("\n"), CW * 0.86).slice(0, 7);
  const lh = Math.round(size * 1.28);
  const tagH = s.tag ? 76 : 0;
  const blockH = tagH + lines.length * lh;
  const y0 = s.pos === "top" ? 110 : s.pos === "center" ? Math.round((CH - blockH) / 2) : CH - blockH - 120;
  const gr = g.createLinearGradient(0, y0 - 160, 0, y0 + blockH + 160);
  gr.addColorStop(0, "rgba(0,0,0,0)");
  gr.addColorStop(0.5, "rgba(0,0,0,0.38)");
  gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr;
  g.fillRect(0, Math.max(0, y0 - 160), CW, blockH + 320);
  g.textBaseline = "top";
  if (s.tag) {
    g.font = `40px car_bold`;
    const tw = Math.min(CW * 0.9, g.measureText(s.tag).width + 44);
    roundRect(g, (CW - tw) / 2, y0, tw, 60, 10);
    g.fillStyle = "rgba(20,20,20,0.84)";
    g.fill();
    g.fillStyle = "#FFFFFF";
    g.textAlign = "center";
    g.fillText(s.tag, CW / 2, y0 + 10);
    g.textAlign = "left";
  }
  g.font = `${size}px ${c.title}`;
  g.lineJoin = "round";
  for (const [i, l] of lines.entries()) {
    const y = y0 + tagH + i * lh;
    const plain = l.replace(/\*/g, "");
    g.lineWidth = first ? 12 : 9;
    g.strokeStyle = "#000000";
    g.textAlign = "center";
    g.strokeText(plain, CW / 2, y);
    richLine(c, l, CW / 2, y, "#FFFFFF", "center");
  }
}

/** 한 장 → PNG */
export async function drawCarouselSlide(s: CarouselSlide, d: CarouselDesign, i: number, n: number, image: Buffer | null): Promise<Buffer> {
  fonts();
  const canvas = createCanvas(CW, CH);
  const g = canvas.getContext("2d");
  const fg = isHex(d.fg) ? d.fg : "#F2F2F2";
  const c: Ctx = {
    g,
    d: { ...d, fg, bg: isHex(d.bg) ? d.bg : "#0B0B0D", accent: isHex(d.accent) ? d.accent : "#E5483D" },
    title: d.font && d.font !== "pretendard" && CAPTION_FONTS.some((f) => f.value === d.font) ? fontFamilyOf(d.font) : "car_black",
    muted: alpha(fg, 0.62),
    faint: alpha(fg, 0.04),
    line: alpha(fg, 0.16),
  };
  const img = image ? await loadImage(image).catch(() => null) : null;
  background(c, !(img && s.layout === "cover"));
  const W = CW - PAD * 2;

  if (s.layout === "photo" || (d.theme === "photo" && img && s.layout !== "cards" && s.layout !== "chat" && s.layout !== "list")) {
    drawPhoto(c, s, img, i === 0);
    pageNo(c, i, n, true);
    return canvas.toBuffer("image/png");
  }

  if (s.layout === "cover") {
    let y = 110;
    const th = tagBox(c, s.tag, PAD, y);
    y += th ? th + 40 : 30;
    y += bigTitle(c, s.title, PAD, y, W, 150, 84, 5);
    if (s.body.trim()) {
      const [first, ...rest] = s.body.split("\n");
      y += 34;
      g.font = `56px car_black`;
      g.textBaseline = "top";
      richLine(c, first, PAD, y, c.d.fg);
      y += 84;
      if (rest.length) y += bodyText(c, rest.join("\n"), PAD, y, W, 34, c.muted, "car_med", 4);
    }
    // 그림은 글이 끝난 아래부터 (바탕 빛은 끄고 위쪽은 바탕색으로 스며들게 — 경계 줄·글자 가림 없음)
    imageBelow(c, img, Math.max(y + 10, Math.round(CH * 0.45)));
    pageNo(c, i, n, true);
    return canvas.toBuffer("image/png");
  }

  if (s.layout === "cta") {
    let y = headerRow(c) + (img ? 80 : 260);
    if (img) {
      const sz = 380;
      roundRect(g, (CW - sz) / 2, y, sz, sz, 40);
      g.save();
      g.clip();
      cover(g, img, (CW - sz) / 2, y, sz, sz);
      g.restore();
      y += sz + 60;
    }
    y += bigTitle(c, s.title, CW / 2, y, W, 104, 64, 4, "center");
    y += 30;
    y += bodyText(c, s.body, CW / 2, y, W, 38, c.muted, "car_med", 4, "center");
    const pill = parseLines(s.lines)[0]?.text;
    if (pill) {
      g.font = `40px car_bold`;
      const pw = g.measureText(pill.replace(/\*/g, "")).width + 100;
      y += 50;
      roundRect(g, (CW - pw) / 2, y, pw, 96, 48);
      g.fillStyle = c.d.accent;
      g.fill();
      g.fillStyle = c.d.theme === "warning" ? "#111111" : "#FFFFFF";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(pill.replace(/\*/g, ""), CW / 2, y + 50);
      g.textAlign = "left";
    }
    pageNo(c, i, n, false);
    return canvas.toBuffer("image/png");
  }

  // 큰 제목 · 카드 · 말풍선 · 목록: 머리말 → 태그 → 제목 → 본문 → (카드·말풍선·목록 / 그림)
  let y = headerRow(c);
  const th = tagBox(c, s.tag, PAD, y);
  if (th) y += th + 30;
  const big = s.layout === "title" ? 112 : 92;
  y += bigTitle(c, s.title, PAD, y, W, big, 60, s.layout === "title" ? 5 : 3);
  if (s.body.trim()) {
    y += 26;
    y += bodyText(c, s.body, PAD, y, W, s.layout === "title" ? 40 : 34, c.muted, "car_med", s.layout === "title" ? 8 : 3);
  }
  y += 44;
  if (s.layout === "cards") drawCards(c, s.lines, y);
  else if (s.layout === "chat") drawChat(c, s.lines, y);
  else if (s.layout === "list") drawList(c, s.lines, y);
  else if (img) {
    // 큰 제목 장의 그림: 남은 자리에 둥근 사진
    const h = CH - y - 110;
    if (h > 220) {
      roundRect(g, PAD, y, W, h, 24);
      g.save();
      g.clip();
      cover(g, img, PAD, y, W, h);
      g.restore();
    }
  }
  pageNo(c, i, n, false);
  return canvas.toBuffer("image/png");
}
