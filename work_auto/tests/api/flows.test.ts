import { beforeAll, describe, expect, it } from "vitest";

/**
 * 실행 중인 서버(데모 모드: Supabase·AI 키 없이)에 실제로 요청해 주요 흐름을 확인한다.
 *   npm run build && npx next start -p 3000   (다른 터미널)
 *   npm run test:api                          (API_BASE_URL 로 주소 변경 가능)
 * 데모 데이터가 바뀌므로 서버를 새로 띄운 직후에 돌린다. 1분 호출 한도에 걸리지 않게 AI 호출 수를 줄였다.
 */
const BASE = process.env.API_BASE_URL ?? "http://localhost:3000";

async function j<T = unknown>(path: string, init?: RequestInit): Promise<{ ok: boolean; data: T; error?: { code: string; message: string } }> {
  const res = await fetch(BASE + path, { headers: { "content-type": "application/json" }, ...init });
  return res.json();
}
const post = (path: string, body: unknown, method = "POST") => j(path, { method, body: JSON.stringify(body) });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let reachable = false;
beforeAll(async () => {
  reachable = await fetch(BASE + "/login").then(
    (r) => r.ok,
    () => false,
  );
  if (!reachable) console.warn(`서버(${BASE})가 꺼져 있어 API 테스트를 건너뜁니다.`);
});

type Content = { id: string; productId: string | null; output: Record<string, string | string[]>; context: Record<string, unknown> };

describe("생성 → 다시 만들기 → 직접 수정 → 학습", () => {
  it("YouTube 제품 영상: 출력 구성과 다시 만들기·직접 수정", async ({ skip }) => {
    if (!reachable) skip();
    const products = await j<{ id: string }[]>("/api/products");
    const gen = await post("/api/contents/generate", { featureId: "yt-product-video", input: { productId: products.data[0].id, length: "15s" } });
    expect(gen.ok).toBe(true);
    const c = gen.data as Content;
    expect(c.output.titles).toHaveLength(10);
    expect(c.output.hooks).toHaveLength(10);
    expect(c.output.ctas).toHaveLength(10);
    expect(String(c.output.script)).not.toMatch(/\[컷|0~5초|^##/m);
    expect(c.output.script).toHaveLength(3); // 대본 3편
    expect(new Set(c.output.script as string[]).size).toBe(3);

    // 후보 목록은 [추가 만들기]: 새 후보 10개가 위에, 기존 후보는 아래에 그대로
    const added = await post(`/api/contents/${c.id}/regenerate`, { key: "hooks" });
    expect(added.ok).toBe(true);
    const hooks = (added.data as Content).output.hooks as string[];
    expect(hooks).toHaveLength(20);
    expect(hooks.slice(10)).toEqual(c.output.hooks);
    expect((added.data as Content).output.titles).toEqual(c.output.titles); // 다른 칸은 그대로

    // 대본도 [추가 만들기]: 3편이 앞에 더해진다
    const regen = await post(`/api/contents/${c.id}/regenerate`, { key: "script" });
    const scripts = (regen.data as Content).output.script as string[];
    expect(scripts).toHaveLength(6);
    expect(scripts.slice(3)).toEqual(c.output.script);

    const edited = await post(`/api/contents/${c.id}/annotations`, { edit: { key: "script", value: "고친 대본이에요\n짧게요" } }, "PATCH");
    expect(((edited.data as Content).context.userEdits as Record<string, unknown>).script).toBeTruthy();
    const picked = await post(`/api/contents/${c.id}/annotations`, { pick: { key: "titles", values: [c.output.titles[0]] } }, "PATCH");
    expect(picked.ok).toBe(true);

    // 체크한 제목·대표 제목은 추가 만들기 뒤에도 그대로
    const moreTitles = (await post(`/api/contents/${c.id}/regenerate`, { key: "titles" })).data as Content & { headline: string };
    expect(moreTitles.output.titles).toHaveLength(20);
    expect((moreTitles.context.picks as Record<string, { values: string[] }>).titles.values).toEqual([c.output.titles[0]]);
    expect(moreTitles.headline).toBe((gen.data as { headline: string }).headline);

    const fb = await post("/api/feedback", { contentId: c.id, rating: "up" });
    expect(fb.ok).toBe(true);
    const learning = await j<{ id: string; myPending: number }[]>("/api/learning");
    expect(learning.data.find((p) => p.id === "youtube:product")!.myPending).toBeGreaterThanOrEqual(3);
  });

  it("블로그: CTA 후보 10개, 본문에 ## 없음, 본문을 다시 만들면 소제목도 함께, 해시태그는 추가", async ({ skip }) => {
    if (!reachable) skip();
    const gen = await post("/api/contents/generate", { featureId: "blog-info-writing", input: { writingType: "일반 정보", topic: "겨울철 난방비" } });
    const c = gen.data as Content;
    expect(c.output.ctas).toHaveLength(10);
    expect(String(c.output.body)).not.toMatch(/^#{1,6}\s/m);
    const regen = (await post(`/api/contents/${c.id}/regenerate`, { key: "body" })).data as Content;
    expect(regen.output.body).not.toBe(c.output.body);
    expect(regen.output.headings).not.toEqual(c.output.headings);
    const tags = (await post(`/api/contents/${c.id}/regenerate`, { key: "hashtags" })).data as Content;
    expect(tags.output.hashtags).toHaveLength(60);
    expect(tags.output.body).toBe(regen.output.body);
  });
});

describe("업로드 관리", () => {
  it("기존 콘텐츠로 등록(자동 채움) → 상태 배지 계산 → YouTube 1·7일 성과 자동 저장", async ({ skip }) => {
    if (!reachable) skip();
    const gen = (await post("/api/contents/generate", { featureId: "yt-info-video", input: { topic: "업로드 테스트", category: "생활" } })).data as Content;
    let status = await j<Record<string, string>>(`/api/publications/status?ids=${gen.id}`);
    expect(status.data[gen.id]).toBeUndefined(); // 미업로드

    const pub = await post("/api/publications", {
      contentId: gen.id,
      status: "published",
      publishedAt: new Date(Date.now() - 8 * 864e5).toISOString(),
      platformUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
    expect(pub.ok).toBe(true);
    expect((pub.data as { title: string; platform: string }).platform).toBe("youtube");
    status = await j(`/api/publications/status?ids=${gen.id}`);
    expect(status.data[gen.id]).toBe("published");

    const from = new Date(Date.now() - 40 * 864e5).toISOString();
    const to = new Date(Date.now() + 40 * 864e5).toISOString();
    await j(`/api/publications?from=${from}&to=${to}`); // 응답 뒤 성과 수집
    await sleep(1500);
    // 직접 넣은 조회수 → 성과 데이터 + 날짜 패널 표시
    const pubId = (pub.data as { id: string }).id;
    expect((await post(`/api/publications/${pubId}/views`, { views: "18,000" })).ok).toBe(true);
    const st = (await j<Record<string, { manual?: { views: number } }>>(`/api/publications/stats?ids=${pubId}`)).data;
    expect(st[pubId].manual?.views).toBe(18000);
    const direct = (await post("/api/publications", { platform: "youtube", title: "직접 등록", status: "published" })).data as { id: string };
    expect((await post(`/api/publications/${direct.id}/views`, { views: 100 })).ok).toBe(false); // 콘텐츠 연결 없으면 학습에 못 씀
    const perf = await j<{ contentId: string; source: string }[]>("/api/performance");
    expect(perf.data.filter((m) => m.contentId === gen.id).map((m) => m.source).sort()).toEqual(["manual", "youtube-d1", "youtube-d7"]);
  });

  it("입력 검사: 제목 없음·예약일 없음·위험한 URL 거부", async ({ skip }) => {
    if (!reachable) skip();
    expect((await post("/api/publications", { platform: "youtube", title: "" })).ok).toBe(false);
    expect((await post("/api/publications", { platform: "youtube", title: "x", status: "scheduled" })).ok).toBe(false);
    expect((await post("/api/publications", { platform: "youtube", title: "x", platformUrl: "javascript:alert(1)" })).ok).toBe(false);
  });
});

describe("트렌드·스타일·오류 기록", () => {
  it("NAVER 트렌드: 처음 10개 → [더보기] 10개 더 (중복 없음)", async ({ skip }) => {
    if (!reachable) skip();
    const first = await j<{ insight: { risingKeywords: { text: string }[]; more: { rising: boolean } } }>("/api/trends/naver?scope=clip&period=14");
    expect(first.data.insight.risingKeywords).toHaveLength(10);
    expect(first.data.insight.more.rising).toBe(true);
    const more = await j<{ risingKeywords: { text: string }[] }>("/api/trends/naver/more?scope=clip&period=14&section=rising&offset=10");
    const shown = new Set(first.data.insight.risingKeywords.map((k) => k.text));
    expect(more.data.risingKeywords.some((k) => shown.has(k.text))).toBe(false);
  });

  it("나의 스타일 파일 일괄 추가: 추천 예시 300개 미리보기", async ({ skip }) => {
    if (!reachable) skip();
    const csv = await fetch(BASE + "/samples/style-starter.csv").then((r) => r.blob());
    const fd = new FormData();
    fd.append("file", new File([csv], "style-starter.csv", { type: "text/csv" }));
    const r = await fetch(BASE + "/api/styles/import", { method: "POST", body: fd }).then((x) => x.json());
    expect(r.data.items.hook).toHaveLength(100);
    expect(r.data.items.title_pattern).toHaveLength(100);
  });

  it("나의 스타일 원하는 유형: 저장 → 예시 만들기 → 생성에 반영", async ({ skip }) => {
    if (!reachable) skip();
    const created = await post("/api/styles", { name: "유형 테스트", channelIds: [], hooks: [], ctas: [], titlePatterns: [], preferredTypes: { hooks: ["shock", "twist", "모름"], ctas: ["save"] } });
    const sty = created.data as { id: string; preferredTypes: Record<string, string[]> };
    expect(sty.preferredTypes).toEqual({ hooks: ["shock", "twist"], ctas: ["save"] });

    const ex = await post("/api/styles/type-examples", { kind: "hooks", types: ["shock", "twist"], existing: [] });
    expect((ex.data as { items: string[] }).items).toHaveLength(10);
    expect((await post("/api/styles/type-examples", { kind: "hooks", types: [] })).ok).toBe(false);

    const gen = (await post("/api/contents/generate", { featureId: "yt-info-video", input: { topic: "유형 테스트", category: "생활", styleId: sty.id } })).data as Content;
    expect((gen.context.styleSamples as { preferredTypes?: Record<string, string[]> }).preferredTypes).toEqual({ hooks: ["충격형", "반전형"], ctas: ["저장 유도"] });
    await j(`/api/styles/${sty.id}`, { method: "DELETE" });
  });

  it("대본 포맷: 메모장 대본 → AI 포맷 → 저장(기본) → 제품 영상에 자동 적용, 블로그에는 없음", async ({ skip }) => {
    if (!reachable) skip();
    const examples = [
      { title: "청소기 후회", views: 18000, text: "무선청소기\n아무거나 사면 후회합니다\n1.3kg 가벼운 무게\n아래 제품 보기에서 확인하세요" },
      { title: "에어프라이어", views: 9000, text: "에어프라이어\n이거 모르면 손해예요\n듀얼 히터라 고르게 익어요\n아래 링크 확인하세요" },
    ];
    const a = (await post("/api/script-formats/analyze", { examples, contentType: "product" })).data as { name: string; guideline: string };
    expect(a.guideline).toContain("[구조]");
    expect((await post("/api/script-formats/analyze", { examples: [], contentType: "product" })).ok).toBe(false);
    const saved = (await post("/api/script-formats", { name: "테스트 포맷", contentType: "product", channelIds: [], examples, guideline: a.guideline, isDefault: true })).data as { id: string; isDefault: boolean };
    expect(saved.isDefault).toBe(true);
    const list = (await j<{ id: string; isDefault: boolean; contentType: string }[]>("/api/script-formats")).data;
    expect(list.filter((f) => f.contentType === "product" && f.isDefault).map((f) => f.id)).toEqual([saved.id]); // 유형마다 기본 1개

    const products = await j<{ id: string }[]>("/api/products");
    // 데모 기본 스타일(친근한 리뷰어)은 '후회형 제품 쇼츠'에 연결되어 있어 기본 포맷보다 먼저
    const gen = (await post("/api/contents/generate", { featureId: "yt-product-video", input: { productId: products.data[0].id } })).data as Content;
    expect((gen.context.scriptFormat as { name: string }).name).toBe("후회형 제품 쇼츠");
    // 생성 화면에서 고른 포맷이 가장 먼저
    const picked = (await post("/api/contents/generate", { featureId: "yt-product-video", input: { productId: products.data[0].id, scriptFormatId: saved.id } })).data as Content;
    expect((picked.context.scriptFormat as { name: string }).name).toBe("테스트 포맷");
    // 연결 없는 채널(클립)의 기본 스타일 → 기본 포맷(★)
    const clip = (await post("/api/contents/generate", { featureId: "clip-product-content", input: { productId: products.data[0].id } })).data as Content;
    expect((clip.context.scriptFormat as { name: string }).name).toBe("테스트 포맷");
    const blog = (await post("/api/contents/generate", { featureId: "blog-info-writing", input: { writingType: "일반 정보", topic: "포맷 테스트" } })).data as Content;
    expect(blog.context.scriptFormat ?? null).toBeNull();

    // 스타일에 연결한 포맷이 기본 포맷보다 먼저
    const other = (await post("/api/script-formats", { name: "스타일 전용 포맷", contentType: "product", examples, guideline: a.guideline })).data as { id: string };
    expect((await post("/api/styles", { name: "포맷 연결 스타일", channelIds: [], hooks: [], ctas: [], titlePatterns: [], infoFormatId: other.id })).ok).toBe(false); // 유형이 다르면 거부
    const sty = (await post("/api/styles", { name: "포맷 연결 스타일", channelIds: [], hooks: [], ctas: [], titlePatterns: [], productFormatId: other.id })).data as { id: string };
    const viaStyle = (await post("/api/contents/generate", { featureId: "yt-product-video", input: { productId: products.data[0].id, styleId: sty.id } })).data as Content;
    expect((viaStyle.context.scriptFormat as { name: string }).name).toBe("스타일 전용 포맷");
    // 포맷을 지우면 스타일 연결만 풀린다
    await j(`/api/script-formats/${other.id}`, { method: "DELETE" });
    const styles = (await j<{ id: string; productFormatId: string | null }[]>("/api/styles")).data;
    expect(styles.find((x) => x.id === sty.id)!.productFormatId).toBeNull();
    await j(`/api/styles/${sty.id}`, { method: "DELETE" });
    await j(`/api/script-formats/${saved.id}`, { method: "DELETE" });
  });

  it("화면 오류 기록: 비밀값을 가리고 관리자만 본다", async ({ skip }) => {
    if (!reachable) skip();
    const msg = `테스트 오류 ${Date.now()} key=sk-ant-abcdefghijklmnop1234`;
    expect((await post("/api/errors", { message: msg, path: "/test" })).ok).toBe(true);
    const logs = await j<{ message: string }[]>("/api/admin/errors?days=1");
    const hit = logs.data.find((l) => l.message.startsWith(msg.slice(0, 20)));
    expect(hit).toBeTruthy();
    expect(hit!.message).not.toContain("abcdefghijklmnop");
  });
});
