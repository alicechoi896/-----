/**
 * 인스타그램 캐러셀 (v0.9.173) — 화면·서버 공용 형식.
 * 주제·제목·내용 → AI 글(장마다 종류·글) → 테마(색·글꼴)로 1080×1350 PNG. 그림은 Kie(확인 후) 또는 올리기.
 * 예전 '제품 캐러셀'(사진 위 글)은 layout 'photo' 장으로 그대로 열린다.
 */
export type SlideLayout = "cover" | "title" | "cards" | "chat" | "list" | "photo" | "cta";
export const SLIDE_LAYOUTS: { value: SlideLayout; label: string; hint: string }[] = [
  { value: "cover", label: "표지", hint: "태그 + 큰 제목(강조색) + 부제 + 그림" },
  { value: "title", label: "큰 제목", hint: "머리말 + 큰 제목 + 본문" },
  { value: "cards", label: "카드", hint: "라벨 붙은 상자 여러 개 (라벨: 내용)" },
  { value: "chat", label: "말풍선", hint: "대화 말풍선 + 결과 상자 (나: / 상대: / 결과:)" },
  { value: "list", label: "목록", hint: "번호 목록 (한 줄에 하나)" },
  { value: "photo", label: "사진 위 글", hint: "그림·사진을 꽉 채우고 글을 얹음" },
  { value: "cta", label: "마무리", hint: "저장·팔로우·댓글 유도" },
];

export type SlidePos = "top" | "center" | "bottom";

export interface CarouselSlide {
  /** 장 id (순서를 바꿔도 그림 작업이 따라가게) */
  id: string;
  layout: SlideLayout;
  /** 작은 태그 (예: WARNING, READ FIRST, 01) */
  tag: string;
  /** 큰 제목. *별표* 로 감싼 말은 강조색, 줄바꿈 = 줄 */
  title: string;
  /** 부제·본문 */
  body: string;
  /** 카드·목록·말풍선 줄 (한 줄에 하나: '라벨: 내용' · '나: 말' · '상대: 말' · '결과: 문구') */
  lines: string;
  /** 그림 (사진 모음의 key) */
  imageKey: string | null;
  /** AI 그림 설명 (영어, Kie 에 보냄) */
  imagePrompt: string;
  /** 사진 위 글 자리 */
  pos: SlidePos;
}

export type ThemeId = "warning" | "clean" | "note" | "photo";
export interface CarouselDesign {
  theme: ThemeId;
  bg: string;
  fg: string;
  accent: string;
  /** 글꼴 (CAPTION_FONTS 값, 기본 pretendard) */
  font: string;
  /** 위쪽 머리말 (예: 비기의 Tip · CLAUDE POLICY) */
  header: string;
  /** 오른쪽 위 짧은 표시 (예: READ FIRST) */
  badge: string;
  /** 쪽수 1/13 표시 */
  pageNo: boolean;
  /** 참고 이미지에서 고른 느낌 메모 (AI 글에도 참고) */
  note: string;
}

export const THEMES: { value: ThemeId; label: string; design: Omit<CarouselDesign, "header" | "badge" | "pageNo" | "note" | "font"> }[] = [
  { value: "warning", label: "어두운 경고형", design: { theme: "warning", bg: "#0B0B0D", fg: "#F2F2F2", accent: "#E5483D" } },
  { value: "clean", label: "밝은 정보형", design: { theme: "clean", bg: "#F6F5F1", fg: "#141414", accent: "#2F6BFF" } },
  { value: "note", label: "노트형", design: { theme: "note", bg: "#FFFDF5", fg: "#232323", accent: "#FF7A1A" } },
  { value: "photo", label: "사진형", design: { theme: "photo", bg: "#000000", fg: "#FFFFFF", accent: "#FFE94D" } },
];

export const DEFAULT_DESIGN: CarouselDesign = { ...THEMES[0].design, font: "pretendard", header: "", badge: "", pageNo: true, note: "" };

export const CAROUSEL_MAX_SLIDES = 15;
export const CAROUSEL_MAX_PHOTOS = 30;
/** Kie 그림 1장 크레딧 (Nano Banana, 패션과 같음 ≈ $0.02) */
export const CAROUSEL_IMAGE_CREDITS = 4;

export interface CarouselImageTask {
  id: string;
  slideId: string;
  taskId: string | null;
  state: "waiting" | "success" | "fail";
  error: string | null;
  createdAt: string;
}

export const newSlideId = () => `sl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export const emptySlide = (layout: SlideLayout = "title"): CarouselSlide => ({ id: newSlideId(), layout, tag: "", title: "", body: "", lines: "", imageKey: null, imagePrompt: "", pos: "bottom" });

/** *강조* 나누기: [글, 강조?][] */
export function accentSegments(line: string): { text: string; accent: boolean }[] {
  const out: { text: string; accent: boolean }[] = [];
  const re = /\*([^*]+)\*/g;
  let last = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > last) out.push({ text: line.slice(last, m.index), accent: false });
    out.push({ text: m[1], accent: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last), accent: false });
  return out.filter((s) => s.text);
}

/** 말풍선 줄 읽기: 나:/상대:/결과:/라벨: */
export function parseLines(raw: string): { kind: "me" | "other" | "result" | "item"; label: string; text: string }[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^([^:：]{1,16})[:：]\s*(.+)$/);
      if (!m) return { kind: "item" as const, label: "", text: l };
      const label = m[1].trim();
      if (/^(나|me|내가|질문)$/i.test(label)) return { kind: "me" as const, label, text: m[2] };
      if (/^(상대|ai|답|답변|친구|그쪽)$/i.test(label)) return { kind: "other" as const, label, text: m[2] };
      if (/^(결과|result|end|결론)$/i.test(label)) return { kind: "result" as const, label, text: m[2] };
      return { kind: "item" as const, label, text: m[2] };
    });
}
