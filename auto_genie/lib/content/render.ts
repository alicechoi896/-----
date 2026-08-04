import type { PlatformContent } from "@/lib/ai/schemas";
import type { Platform } from "@/types/database";

export interface RenderedContent {
  title: string | null;
  body: string;
  hook: string | null;
  callToAction: string | null;
  hashtags: string[];
  seoKeywords: string[];
}

/** Flattens a platform's structured AI output into the generic columns content_outputs stores. */
export function renderPlatformContent<P extends Platform>(
  platform: P,
  content: PlatformContent[P]
): RenderedContent {
  switch (platform) {
    case "naver_blog": {
      const c = content as PlatformContent["naver_blog"];
      return {
        title: c.title,
        body: [c.intro, ...c.sections.map((s) => `## ${s.heading}\n${s.body}`)].join("\n\n"),
        hook: c.intro,
        callToAction: c.callToAction,
        hashtags: [],
        seoKeywords: c.seoKeywords,
      };
    }
    case "instagram": {
      const c = content as PlatformContent["instagram"];
      return {
        title: c.hook,
        body: c.slides.map((s, i) => `[슬라이드 ${i + 1}] ${s}`).join("\n\n") + `\n\n캡션: ${c.caption}`,
        hook: c.hook,
        callToAction: c.callToAction,
        hashtags: c.hashtags,
        seoKeywords: [],
      };
    }
    case "threads": {
      const c = content as PlatformContent["threads"];
      return {
        title: c.firstPost,
        body: [c.firstPost, ...c.thread].join("\n\n"),
        hook: c.firstPost,
        callToAction: c.closingPrompt,
        hashtags: [],
        seoKeywords: [],
      };
    }
    case "youtube_shorts": {
      const c = content as PlatformContent["youtube_shorts"];
      return {
        title: c.titleOptions[0] ?? null,
        body: c.scenes.map((s, i) => `[${i + 1}. ${s.scene}]\n대사: ${s.script}\n자막: ${s.caption}`).join("\n\n"),
        hook: c.hook,
        callToAction: c.callToAction,
        hashtags: [],
        seoKeywords: [],
      };
    }
    case "newsletter": {
      const c = content as PlatformContent["newsletter"];
      return {
        title: c.titleOptions[0] ?? null,
        body: [c.intro, c.caseStudy, c.mainContent].join("\n\n"),
        hook: c.preheader,
        callToAction: c.callToAction,
        hashtags: [],
        seoKeywords: [],
      };
    }
    case "landing_page": {
      const c = content as PlatformContent["landing_page"];
      return {
        title: c.headline,
        body: [
          `문제: ${c.problem}`,
          `해결책: ${c.solution}`,
          `차별점: ${c.differentiators.join(", ")}`,
          `신뢰 요소: ${c.trustElements.join(", ")}`,
          `상품 안내: ${c.productDetails}`,
          `FAQ:\n${c.faq.map((f) => `Q. ${f.question}\nA. ${f.answer}`).join("\n")}`,
        ].join("\n\n"),
        hook: c.headline,
        callToAction: c.callToAction,
        hashtags: [],
        seoKeywords: [],
      };
    }
    default:
      throw new Error("Unsupported platform: " + platform);
  }
}
