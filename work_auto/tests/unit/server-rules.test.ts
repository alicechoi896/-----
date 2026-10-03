import { describe, expect, it } from "vitest";
import { assertPublicUrl } from "@/lib/server/security/safe-url";
import { previewStyleImport } from "@/lib/server/services/style-import";
import { scrubSecrets } from "@/lib/server/services/error-log";
import { editRatio } from "@/lib/server/services/memory";
import { compressContent, promptInsights, sanitizeSummary } from "@/lib/server/services/learning";
import { isYouTubePublication } from "@/lib/server/services/youtube-stats";
import type { GeneratedContent, LearningProfile } from "@/lib/types";

describe("보안: 서버가 내부 주소로 접속하지 않는다 (SSRF)", () => {
  it.each(["http://localhost:3000", "http://127.0.0.1", "http://169.254.169.254/latest", "http://10.0.0.5", "http://192.168.0.1", "http://[::1]/", "http://[::ffff:127.0.0.1]/", "file:///etc/passwd", "http://user:pw@1.1.1.1"])(
    "%s 거부",
    async (url) => {
      await expect(assertPublicUrl(url)).rejects.toThrow();
    },
  );
  it("공개 IP 는 허용", async () => {
    await expect(assertPublicUrl("https://1.1.1.1/")).resolves.toBeInstanceOf(URL);
  });
});

describe("나의 스타일 파일 일괄 추가 (서버 검사)", () => {
  const file = (name: string, content: string | Uint8Array, type: string) => new File([content as BlobPart], name, { type });
  it("TXT: 빈 줄·공백·중복·제어 문자 정리, 500자 넘는 줄은 오류 행", async () => {
    const r = await previewStyleImport(file("a.txt", "  하나 \n\n둘\n하나\n셋\u0000\n" + "가".repeat(501), "text/plain"), "hook");
    expect(r.items.hook).toEqual(["하나", "둘", "셋"]);
    expect(r.duplicateInFile).toBe(1);
    expect(r.errorCount).toBe(1);
  });
  it("CSV: 종류별, 따옴표 안 쉼표, 모르는 type 은 오류 행", async () => {
    const r = await previewStyleImport(file("s.csv", 'type,text\nhook,"a, b"\ncta,c\nunknown,x\n', "text/csv"), null);
    expect(r.items.hook).toEqual(["a, b"]);
    expect(r.items.cta).toEqual(["c"]);
    expect(r.errors[0].line).toBe(4);
  });
  it("확장자·형식이 틀리거나 바이너리면 거부", async () => {
    await expect(previewStyleImport(file("x.exe", "MZ", "application/octet-stream"), null)).rejects.toThrow();
    await expect(previewStyleImport(file("x.txt", "abc", "image/png"), "hook")).rejects.toThrow();
    await expect(previewStyleImport(file("x.txt", new Uint8Array([1, 0, 0, 0, 0, 0, 2]), "text/plain"), "hook")).rejects.toThrow();
  });
});

describe("오류 기록: 비밀값을 가린다", () => {
  it("API 키·토큰·JWT", () => {
    const s = scrubSecrets("key sk-ant-abcdefghijk1234 yt AIzaSyD1234567890abcdefghij Bearer abcdefghijklmn token=supersecret eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.c2lnbmF0dXJl");
    expect(s).not.toMatch(/abcdefghijk1234|AIzaSyD123|supersecret|eyJzdWIi/);
  });
});

describe("학습 프로필 규칙", () => {
  it("수정량: 같으면 0, 완전히 다르면 1에 가깝다", () => {
    expect(editRatio("같은 문장입니다", "같은 문장입니다")).toBe(0);
    expect(editRatio("가나다라마바사", "zyxwvut")).toBeGreaterThan(0.9);
  });

  it("AI 결과를 다시 정리: 중복은 하나만, 근거 1개면 confidence ≤ 0.4", () => {
    const s = sanitizeSummary(
      {
        title_insights: [
          { text: "숫자 제목", support_count: 1, positive_count: 1, negative_count: 0, confidence: 0.9, updated: true },
          { text: "숫자  제목", support_count: 3, positive_count: 3, negative_count: 0, confidence: 0.9, updated: true },
        ],
      },
      {},
    );
    expect(s.title_insights).toHaveLength(1);
    expect(s.title_insights![0].confidence).toBeLessThanOrEqual(0.4);
  });

  it("항목당 10개까지만 (신뢰도 높은 순)", () => {
    const raw = { hook_insights: Array.from({ length: 15 }, (_, i) => ({ text: `경향 ${i}`, support_count: 3, positive_count: 2, negative_count: 0, confidence: i / 20, updated: true })) };
    const s = sanitizeSummary(raw, {});
    expect(s.hook_insights).toHaveLength(10);
    expect(s.hook_insights![0].text).toBe("경향 14");
  });

  it("생성에 넣는 경향은 근거·신뢰도 기준을 넘는 것만", () => {
    const now = new Date().toISOString();
    const p = {
      summaryJson: {
        title_insights: [
          { text: "강한 경향", support_count: 5, positive_count: 4, negative_count: 0, confidence: 0.8, last_seen_at: now },
          { text: "약한 경향", support_count: 1, positive_count: 1, negative_count: 0, confidence: 0.3, last_seen_at: now },
        ],
      },
    } as unknown as LearningProfile;
    expect(promptInsights(p).map((i) => i.text)).toEqual(["강한 경향"]);
  });

  it("학습용 요약은 원문 전체가 아니라 짧게 (수정본·선택한 제목 우선)", () => {
    const c = {
      channelId: "youtube",
      headline: "원래 제목",
      output: { titles: ["원래 제목", "다른 제목"], hooks: ["훅"], script: "긴 대본\n".repeat(200), ctas: ["CTA"] },
      context: { picks: { titles: { values: ["다른 제목"], at: "" } }, userEdits: { hooks: { value: ["고친 훅"], at: "", ratio: 0.5 } } },
    } as unknown as GeneratedContent;
    const text = compressContent(c, 600);
    expect(text).toContain("제목: 다른 제목");
    expect(text).toContain("Hook: 고친 훅");
    expect(text.length).toBeLessThanOrEqual(601);
  });
});

describe("YouTube 성과 자동 수집 대상", () => {
  it("YouTube 주소가 있는 업로드만", () => {
    expect(isYouTubePublication({ platform: "youtube", platformUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" })).toBe(true);
    expect(isYouTubePublication({ platform: "youtube", platformUrl: "https://youtu.be/dQw4w9WgXcQ" })).toBe(true);
    expect(isYouTubePublication({ platform: "naver-blog", platformUrl: "https://blog.naver.com/x" })).toBe(false);
    expect(isYouTubePublication({ platform: "youtube", platformUrl: null })).toBe(false);
  });
});
