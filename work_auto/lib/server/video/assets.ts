import "server-only";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * 영상 자료 (v0.9.51): assets/video/{bgm,sfx,arrow,ending,meme,fonts}. 사용 권한이 확실한 자체 자료만 둔다.
 * Vercel 에는 next.config outputFileTracingIncludes 로 함께 올라간다. 파일이 없으면 그 요소만 빼고 만든다 (QA 에 안내).
 * 효과음은 파일 이름이 종류다 (pop.mp3, whoosh.wav …).
 */
const ROOT = path.join(process.cwd(), "assets", "video");
const AUDIO = /\.(mp3|wav|m4a|aac|ogg)$/i;
const IMAGE = /\.(gif|png|webp)$/i;
const FONT = /\.(ttf|otf)$/i;

function files(dir: string, re: RegExp): string[] {
  const d = path.join(ROOT, dir);
  if (!existsSync(d)) return [];
  return readdirSync(d)
    .filter((f) => re.test(f))
    .sort()
    .map((f) => path.join(d, f));
}

/** 글꼴: 템플릿 키 → 파일 이름 단서. 없으면 Pretendard(포함됨)로 */
const FONT_HINTS: Record<string, RegExp> = {
  dohyeon: /dohyeon|도현/i,
  jua: /jua|주아/i,
  recipe: /recipe|레시피|레코/i,
};
const FALLBACK_FONT = path.join(process.cwd(), "node_modules", "pretendard", "dist", "public", "static", "Pretendard-Black.otf");

export const videoAssets = {
  bgm: () => files("bgm", AUDIO),
  sfx: () => files("sfx", AUDIO),
  arrow: () => files("arrow", IMAGE)[0] ?? null,
  ending: () => files("ending", IMAGE)[0] ?? null,
  meme: () => files("meme", IMAGE),
  font(key: string): { file: string; fallback: boolean } {
    const hint = FONT_HINTS[key];
    const hit = hint ? files("fonts", FONT).find((f) => hint.test(path.basename(f))) : undefined;
    return hit ? { file: hit, fallback: false } : { file: FALLBACK_FONT, fallback: true };
  },
  /** 화면에 보여 줄 요약 */
  summary() {
    return {
      bgm: this.bgm().map((f) => path.basename(f)),
      sfx: this.sfx().map((f) => path.basename(f)),
      arrow: Boolean(this.arrow()),
      ending: Boolean(this.ending()),
      meme: this.meme().length,
      fonts: Object.fromEntries(Object.keys(FONT_HINTS).map((k) => [k, !this.font(k).fallback])) as Record<string, boolean>,
    };
  },
};

/** 효과음 종류 = 파일 이름 (확장자 뺀 것) */
export const sfxName = (file: string) => path.basename(file).replace(/\.[^.]+$/, "");
