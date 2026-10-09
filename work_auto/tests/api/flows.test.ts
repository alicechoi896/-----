import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * 실행 중인 서버(데모 모드: Supabase·AI 키 없이)에 실제로 요청해 주요 흐름을 확인한다.
 *   npm run build && npx next start -p 3000   (다른 터미널)
 *   npm run test:api                          (API_BASE_URL 로 주소 변경 가능)
 * 데모 데이터가 바뀌므로 서버를 새로 띄운 직후에 돌린다. 1분 호출 한도에 걸리지 않게 AI 호출 수를 줄였다.
 */
const BASE = process.env.API_BASE_URL ?? "http://localhost:3000";

async function j<T = unknown>(path: string, init?: RequestInit): Promise<{ ok: boolean; data: T; error?: { code: string; message: string } }> {
  const res = await fetch(BASE + path, { headers: { "content-type": "application/json" }, ...init });
  const body = await res.json();
  // 1분 AI 호출 한도(20회)에 걸리면 풀릴 때까지 기다렸다 한 번 더
  if (body?.error?.code === "RATE_LIMIT") {
    await sleep(61_000);
    return (await fetch(BASE + path, { headers: { "content-type": "application/json" }, ...init })).json();
  }
  return body;
}
vi.setConfig({ testTimeout: 150_000 });
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

  it("영상 검색(데모): 플랫폼 하나씩·검색 1번 = 1회·같은 조건 0회·[더 보기] 1회 → 메타로 가져오기 → 제품별 30개씩", async ({ skip }) => {
    if (!reachable) skip();
    type Item = { platform: string; originalUrl: string; title: string; authorName: string | null; durationSec: number | null; thumbnailUrl: string | null };
    type R = { platform: string; translation: { translated: boolean; query: string }; items: Item[]; calls: number; next: Record<string, unknown> | null; filteredByDate: boolean };
    const xhs = (await post("/api/videos/social-search", { keyword: "무선청소기", platform: "xiaohongshu", sort: "general", period: "all" })).data as R;
    expect(xhs.translation).toMatchObject({ translated: true, query: "无线吸尘器" });
    expect(xhs.calls).toBe(1);
    expect(xhs.items).toHaveLength(10); // 데모 한 페이지 10개 → 모두 보여 주고 더 부르지 않는다
    expect(xhs.items.every((i) => i.platform === "xiaohongshu")).toBe(true);
    expect(xhs.next).toBeTruthy();
    const again = (await post("/api/videos/social-search", { keyword: "무선청소기", platform: "xiaohongshu", sort: "general", period: "all" })).data as R;
    expect(again.calls).toBe(0);
    const more = (await post("/api/videos/social-search", { keyword: "무선청소기", platform: "xiaohongshu", sort: "general", period: "all", next: xhs.next })).data as R;
    expect(more.calls).toBe(1);
    expect(more.items[0].originalUrl).not.toBe(xhs.items[0].originalUrl);
    const dy = (await post("/api/videos/social-search", { keyword: "무선청소기", platform: "douyin", period: "all" })).data as R;
    expect(dy.calls).toBe(1);
    expect(dy.items.every((i) => i.platform === "douyin")).toBe(true);
    expect((await post("/api/videos/social-search", { keyword: "x", platforms: ["xiaohongshu", "douyin"] })).ok).toBe(false); // 둘 다 없음
    const zh = (await post("/api/videos/social-search", { keyword: "空气炸锅", platform: "douyin" })).data as R;
    expect(zh.translation.translated).toBe(false);

    // 중국어 제목: 한 페이지를 묶어 번역 (영어·한국어는 보내지 않음)
    const tr = (await post("/api/videos/translate-titles", { items: [...dy.items.slice(0, 10).map((it, i) => ({ id: `dy${i}`, title: it.title })), { id: "en", title: "Vacuum review" }] })).data as { items: { id: string; translatedTitle: string }[] };
    expect(tr.items.length).toBe(Math.min(10, dy.items.length));
    expect(tr.items.some((x) => x.id === "en")).toBe(false);
    expect(tr.items[0].translatedTitle).toMatch(/무선청소기/);
    // 검색 결과 메타로 저장 (상세 API 없이) + v.douyin.com 링크
    const products = await j<{ id: string }[]>("/api/products");
    const pid = products.data[1]?.id ?? products.data[0].id;
    const picked = [xhs.items[0], dy.items[0]];
    const res = (await post("/api/videos/batch", {
      items: [...picked.map((it) => ({ url: it.originalUrl, titleHint: it.title, meta: { channelName: it.authorName, durationSec: it.durationSec, thumbnailUrl: it.thumbnailUrl } })), { url: "https://v.douyin.com/iRNBho6u/" }],
      note: "검색 참고",
      productId: pid,
    })).data as { ok: boolean; video?: { id: string; platform: string; title: string; channelName: string; durationSec: number; productId: string } }[];
    expect(res.every((x) => x.ok)).toBe(true);
    expect(res.map((x) => x.video!.platform)).toEqual(["xiaohongshu", "douyin", "douyin"]);
    expect(res[1].video).toMatchObject({ title: dy.items[0].title, channelName: dy.items[0].authorName, durationSec: dy.items[0].durationSec });
    // 기존 참고 영상: 제품별 30개씩
    const page = (await j<{ items: { productId: string | null }[]; hasMore: boolean; nextOffset: number }>(`/api/videos/page?productId=${pid}`)).data;
    expect(page.items.length).toBeGreaterThanOrEqual(3);
    expect(page.items.every((v) => v.productId === pid)).toBe(true);
    const none = (await j<{ items: { productId: string | null }[] }>("/api/videos/page?productId=none")).data;
    expect(none.items.every((v) => !v.productId)).toBe(true);
    // 데모 도우인은 재생 주소가 없다 → 주소를 만들어 붙이지 않고 안내
    const resolved = await post("/api/videos/resolve", { url: "https://v.douyin.com/iRNBho6u/" });
    expect(resolved.error?.code).toBe("DOUYIN_NO_MEDIA");
    for (const x of res) await j(`/api/videos/${x.video!.id}`, { method: "DELETE" });
  });

  it("[대본 포맷에 담기]: 제목칸에만, 새 포맷 만들기·기존 포맷에 더하기·중복 제외", async ({ skip }) => {
    if (!reachable) skip();
    type F = { id: string; name: string; examples: { title: string; views: number | null; text: string }[] };
    type Res = { format: F; added: number; duplicated: number; overLimit: number };
    const created = (await post("/api/script-formats/titles", { newFormat: { name: "트렌드 제목 모음", contentType: "info" }, titles: [{ title: "요즘 난리 난 이유", views: 52000 }] })).data as Res;
    expect(created.added).toBe(1);
    expect(created.format.examples[0]).toEqual({ title: "요즘 난리 난 이유", views: 52000, text: "" });
    const more = (await post("/api/script-formats/titles", { formatId: created.format.id, titles: [{ title: "요즘 난리 난 이유", views: null }, { title: "이거 모르면 손해", views: null }] })).data as Res;
    expect(more).toMatchObject({ added: 1, duplicated: 1 });
    expect(more.format.examples.map((e) => e.title)).toEqual(["이거 모르면 손해", "요즘 난리 난 이유"]);
    expect((await post("/api/script-formats/titles", { formatId: created.format.id, titles: [] })).ok).toBe(false);
    // 제목만으로는 AI 구조 분석을 하지 않는다
    expect((await post("/api/script-formats/analyze", { examples: more.format.examples, contentType: "info" })).ok).toBe(false);
    await j(`/api/script-formats/${created.format.id}`, { method: "DELETE" });
  });

  it("2단계 생성(데모): 1단계 후보(Keyword Intelligence) → 제목 2개 고르기 → 제목마다 대본 3편·키워드·태그·설명 → 같은 제목 안에 대본 추가 → 이력", async ({ skip }) => {
    if (!reachable) skip();
    const products = await j<{ id: string }[]>("/api/products");
    const call = () => post("/api/contents/stage1", { featureId: "yt-product-video", input: { productId: products.data[0].id, length: "15s", keywords: ["무선 이어폰"] }, clientRequestId: "test-stage1" });
    const s1 = await call();
    expect(s1.ok).toBe(true);
    const c1 = s1.data as Content & { headline: string };
    // 1단계: 제목·Hook·CTA 후보만 (대본·설명·태그 없음)
    expect((c1.output.titles as string[]).length).toBeGreaterThanOrEqual(10);
    expect(c1.output.hooks).toHaveLength(10);
    expect(c1.output.ctas).toHaveLength(10);
    expect(c1.output.script).toBeUndefined();
    expect(c1.output.description).toBeUndefined();
    const wf = c1.context.workflow as { id: string; stage: number; keywordIntelligence: { source: string; candidates: { keyword: string; evidence: string }[] } };
    expect(wf.stage).toBe(1);
    expect(wf.keywordIntelligence.source).toBe("youtube");
    expect(wf.keywordIntelligence.candidates.length).toBeGreaterThan(0);
    expect((c1.context.quality as { titleTop: unknown[] }).titleTop).toHaveLength(5);

    // 2단계: 제목 2개 (같은 Hook·CTA)
    const picked = (c1.output.titles as string[]).slice(0, 2);
    const hook = (c1.output.hooks as string[])[0];
    const cta = (c1.output.ctas as string[])[0];
    const groups: (Content & { headline: string })[] = [];
    for (const title of picked) {
      const r = await post("/api/contents/stage2", { stage1Id: c1.id, title, hook, cta });
      expect(r.ok).toBe(true);
      groups.push(r.data as Content & { headline: string });
    }
    for (const [i, g] of groups.entries()) {
      expect(g.headline).toBe(picked[i]);
      expect(g.output.titles).toBeUndefined();
      expect(g.output.script).toHaveLength(3);
      for (const sc of g.output.script as string[]) {
        expect(sc.split("\n")[0]).toBe(hook);
        expect(sc.split("\n").at(-1)).toBe(cta);
      }
      expect(g.output.description).toBeTruthy();
      expect((g.output.tags as string[]).length).toBeGreaterThan(0);
      const w2 = g.context.workflow as { stage: number; stage1Id: string; selected: { title: string }; primaryKeyword: string; relatedKeywords: unknown[] };
      expect(w2).toMatchObject({ stage: 2, stage1Id: c1.id, selected: { title: picked[i] } });
      expect(w2.primaryKeyword).toBeTruthy();
      expect((g.output.keywords as string[])[0]).toBe(w2.primaryKeyword);
    }
    // 같은 제목 안에 대본 추가 (플랫폼 API 0회, 제목은 그대로)
    const more = await post(`/api/contents/${groups[0].id}/regenerate`, { key: "script" });
    expect(((more.data as Content).output.script as string[]).length).toBe(6);
    expect((more.data as Content & { headline: string }).headline).toBe(picked[0]);
    // 이력: 1단계 1개 + 2단계 2개가 같은 1단계로 이어진다
    const list = await j<Content[]>("/api/contents?featureId=yt-product-video");
    const linked = list.data.filter((c) => (c.context.workflow as { stage1Id?: string } | undefined)?.stage1Id === c1.id);
    expect(linked).toHaveLength(2);
    // 블로그는 2단계가 아니다, 1단계가 아닌 결과로 2단계를 부를 수 없다
    expect((await post("/api/contents/stage1", { featureId: "blog-info-writing", input: { topic: "가을 캠핑" }, clientRequestId: "x" })).ok).toBe(false);
    expect((await post("/api/contents/stage2", { stage1Id: groups[0].id, title: "x", hook: "", cta: "" })).ok).toBe(false);
  }, 120_000);

  it("상품 URL 학습(데모 Bright Data): 새 상품 → 상태 확인 → AI 분석 → 저장 → 다시 넣으면 기존 제품 → 다시 학습", async ({ skip }) => {
    if (!reachable) skip();
    type Start = { status: string; jobId?: string; productId?: string; raw?: Record<string, unknown> };
    const url = `https://www.coupang.com/vp/products/${Date.now() % 1e9}`;
    // 지원하지 않는 주소는 외부 호출 없이 거부
    const bad = await post("/api/products/learn-url", { url: "https://www.gmarket.co.kr/item/1", clientRequestId: "product_learn_bad" });
    expect(bad.error?.code).toBe("UNSUPPORTED_PRODUCT_URL");
    // 시드 제품(쿠팡 7300001)은 추적 파라미터가 붙어도 기존 제품
    const seed = (await post("/api/products/learn-url", { url: "https://www.coupang.com/vp/products/7300001?itemId=1&utm_source=x", clientRequestId: "product_learn_seed" })).data as Start;
    expect(seed.status).toBe("existing");
    // 새 상품: 작업 id → 같은 작업 상태만 확인
    const start = (await post("/api/products/learn-url", { url, clientRequestId: "product_learn_new" })).data as Start;
    expect(start.status).toBe("collecting");
    let raw: Record<string, unknown> | null = null;
    for (let i = 0; i < 10 && !raw; i++) {
      await sleep(800);
      const s = (await post("/api/products/learn-url/status", { jobId: start.jobId, url, clientRequestId: "product_learn_new" })).data as Start;
      if (s.status === "collected") raw = s.raw!;
    }
    expect(raw).toMatchObject({ sourceType: "url", platform: "coupang", url });
    const draft = (await post("/api/products/analyze-collected", { raw })).data as { raw: unknown; analysis: { basicInfo: { name: string } } };
    expect(draft.analysis.basicInfo.name).toBeTruthy();
    const saved = (await post("/api/products", draft)).data as { id: string; sourceUrl: string };
    expect(saved.sourceUrl).toBe(url);
    expect((await post("/api/products", draft)).error?.code).toBe("DUPLICATE_PRODUCT"); // 같은 상품을 또 저장하지 않는다
    const again = (await post("/api/products/learn-url", { url: `${url}?vendorItemId=3`, clientRequestId: "product_learn_again" })).data as Start;
    expect(again).toMatchObject({ status: "existing", productId: saved.id });
    // 다시 학습: 같은 제품의 새 분석 버전
    const re = (await post("/api/products/learn-url", { url, force: true, productId: saved.id, clientRequestId: "product_learn_re" })).data as Start;
    expect(re.status).toBe("collecting");
    await sleep(1700);
    const s2 = (await post("/api/products/learn-url/status", { jobId: re.jobId, url, clientRequestId: "product_learn_re" })).data as Start;
    const d2 = (await post("/api/products/analyze-collected", { raw: s2.raw })).data;
    const detail = (await post(`/api/products/${saved.id}/relearn`, { draft: d2 })).data as { analysis: { version: number } };
    expect(detail.analysis.version).toBe(2);
    await j(`/api/products/${saved.id}`, { method: "DELETE" });
  });

  it("대본 포맷 Hook·CTA·제목·피할 대본 → 생성에 포맷 것 먼저, 블로그 포맷, 프로필 타깃 시청자", async ({ skip }) => {
    if (!reachable) skip();
    type F = { id: string; hooks: string[]; badExamples: { text: string }[]; channelIds: string[] };
    const f = (await post("/api/script-formats", {
      name: "블로그 제품 포맷",
      contentType: "product",
      channelIds: ["naver-blog"],
      examples: [],
      guideline: "",
      isDefault: true,
      hooks: ["이거 모르고 사면 후회해요"],
      ctas: ["아래 링크에서 가격 확인해 보세요"],
      titlePatterns: ["[제품] 사기 전 꼭 볼 [숫자]가지"],
      preferredTypes: { hooks: ["question"] },
      badExamples: [{ title: "", views: null, text: "오늘은 제품을 소개해 드리겠습니다" }],
    })).data as F;
    expect(f).toMatchObject({ channelIds: ["naver-blog"], hooks: ["이거 모르고 사면 후회해요"] });
    expect(f.badExamples).toHaveLength(1);
    const products = await j<{ id: string }[]>("/api/products");
    const gen = (await post("/api/contents/generate", { featureId: "blog-product-writing", input: { productId: products.data[0].id, mainKeyword: "무선청소기" } })).data as Content & { context: { notes: string[]; scriptFormat: { name: string } } };
    expect(gen.context.scriptFormat?.name).toBe("블로그 제품 포맷");
    expect(gen.context.notes.join(" ")).toContain("대본 포맷 '블로그 제품 포맷'의 것을 사용");
    await j(`/api/script-formats/${f.id}`, { method: "DELETE" });
    // 콘텐츠 프로필 타깃 시청자
    const profiles = (await j<{ id: string; name: string; mainCategory: string }[]>("/api/profiles")).data;
    const p = profiles[0];
    const upd = (await post(`/api/profiles/${p.id}`, { ...p, audience: "30대 자취 직장인, 퇴근 후 청소가 귀찮음" }, "PUT")).data as { audience: string };
    expect(upd.audience).toBe("30대 자취 직장인, 퇴근 후 청소가 귀찮음");
  });

  it("영상 자동 제작(데모): 2단계 대본 → 컷 계획(한 줄 = 한 컷·효과음 2컷당 1회·화살표) → 렌더 → 9:16 mp4 → 검수 필요(데모는 글자 검사·음성 없음) → 1회 다운로드 → 승인", async ({ skip }) => {
    if (!reachable) skip();
    const pid = (await j<{ id: string }[]>("/api/products")).data[0].id;
    type R = { items: { originalUrl: string; title: string; authorName: string; durationSec: number }[] };
    const xhs = (await post("/api/videos/social-search", { keyword: "청소기", platform: "xiaohongshu", sort: "general", period: "all" })).data as R;
    const imp = (await post("/api/videos/batch", { items: xhs.items.slice(0, 3).map((it) => ({ url: it.originalUrl, titleHint: it.title, meta: { channelName: it.authorName, durationSec: it.durationSec } })), productId: pid })).data as { ok: boolean; video?: { id: string } }[];
    expect(imp.every((x) => x.ok)).toBe(true);
    const s1 = (await post("/api/contents/stage1", { featureId: "yt-product-video", input: { productId: pid, length: "15s" }, clientRequestId: "vp-test" })).data as Content;
    const s2 = (await post("/api/contents/stage2", { stage1Id: s1.id, title: (s1.output.titles as string[])[0], hook: (s1.output.hooks as string[])[0], cta: (s1.output.ctas as string[])[0] })).data as Content;
    const opts = (await j<{ contents: { id: string }[]; videos: unknown[] }>("/api/video-production/options?channelId=youtube")).data;
    expect(opts.contents.some((c) => c.id === s2.id)).toBe(true);
    // 블로그 원고·다른 채널 원고는 쓸 수 없다
    expect((await post("/api/video-production/plan", { contentId: s2.id, channelId: "naver-clip", sourceMode: "xhs" })).ok).toBe(false);
    expect((await post("/api/video-production/plan", { contentId: s2.id, channelId: "youtube", sourceMode: "ai" })).error?.code).toBe("NOT_READY");
    type Plan = { scenes: { narration: string; sfx: string | null; arrow: boolean; sourceVideoId: string | null }[]; topLine1: string; topLine2: string; selectedTitle: string };
    const plan = (await post("/api/video-production/plan", { contentId: s2.id, scriptIndex: 0, channelId: "youtube", sourceMode: "xhs", videoIds: imp.map((x) => x.video!.id), voice: "onyx" })).data as { plan: Plan };
    const scenes = plan.plan.scenes;
    expect(scenes.length).toBeGreaterThanOrEqual(5);
    expect(plan.plan.selectedTitle).toBe((s1.output.titles as string[])[0]); // 선택한 제목은 그대로
    expect(scenes.every((x) => x.sourceVideoId)).toBe(true);
    for (let i = 1; i < scenes.length; i++) expect(scenes[i].sourceVideoId === scenes[i - 1].sourceVideoId && new Set(scenes.map((x) => x.sourceVideoId)).size > 1).toBe(false);
    expect(scenes.some((x) => x.arrow)).toBe(true);
    type Job = { id: string; status: string; progress: number; fileUrl?: string | null; qa: { durationSec?: number; expectedDurationSec?: number; issues: string[] }; plan: { scenes: { start?: number; textTreatment?: string }[] } };
    let job = (await post("/api/video-jobs", { plan: plan.plan })).data as Job;
    expect(job.status).toBe("queued");
    // 만드는 중에 또 누르면 막는다 (사용자당 동시 1개)
    expect((await post("/api/video-jobs", { plan: plan.plan })).error?.code).toBe("BUSY");
    const t0 = Date.now();
    while (["queued", "analyzing", "editing", "rendering", "quality_check"].includes(job.status) && Date.now() - t0 < 150_000) {
      await sleep(2000);
      job = (await j<Job>(`/api/video-jobs/${job.id}`)).data;
    }
    expect(job.status).toBe("needs_review"); // 데모: 원본 글자 검사·AI 음성 없음 → 자동 승인하지 않는다
    expect(Math.abs((job.qa.durationSec ?? 0) - (job.qa.expectedDurationSec ?? 0))).toBeLessThan(0.5);
    expect(job.plan.scenes.every((x) => x.textTreatment === "unchecked")).toBe(true);
    const file = await fetch(BASE + job.fileUrl!);
    expect(file.headers.get("content-type")).toContain("video/mp4");
    expect((await file.arrayBuffer()).byteLength).toBeGreaterThan(50_000);
    const dl = (await post(`/api/video-jobs/${job.id}/download`, {})).data as { url: string };
    expect(dl.url).toBeTruthy();
    expect(((await post(`/api/video-jobs/${job.id}/approve`, {})).data as Job).status).toBe("approved");
    for (const x of imp) await j(`/api/videos/${x.video!.id}`, { method: "DELETE" });
  }, 200_000);

  it("트렌드 스크랩: YouTube·NAVER·Instagram 저장 → 분류 → 옮기기 → 분류 이름 바꾸기 → 삭제, 같은 항목은 분류만 바뀜", async ({ skip }) => {
    if (!reachable) skip();
    type S = { id: string; source: string; folder: string; url: string };
    const ig = (await post("/api/scraps", { source: "instagram", itemId: "DAbc123xyz", title: "청소기 릴스", keywords: ["청소기"], views: 1000, folder: "가전" })).data as S;
    expect(ig).toMatchObject({ source: "instagram", folder: "가전", url: "https://www.instagram.com/reel/DAbc123xyz/" });
    const nv = (await post("/api/scraps", { source: "naver", itemId: "nv_topic1", title: "겨울 난방비", url: "https://evil.com/x", folder: "" })).data as S;
    expect(nv.url.startsWith("https://search.naver.com/")).toBe(true); // 다른 사이트 주소는 저장하지 않는다
    const again = (await post("/api/scraps", { source: "instagram", itemId: "DAbc123xyz", title: "청소기 릴스", folder: "생활" })).data as S;
    expect(again.id).toBe(ig.id);
    expect(again.folder).toBe("생활");
    expect((await post("/api/scraps", { source: "youtube", itemId: "../x", title: "x", folder: "" })).ok).toBe(false);
    const list = (await j<{ items: S[]; folders: { name: string; count: number }[] }>("/api/scraps")).data;
    expect(list.folders.find((x) => x.name === "생활")?.count).toBe(1);
    await post(`/api/scraps/${nv.id}`, { folder: "생활" }, "PATCH");
    expect(((await post("/api/scraps/folders", { from: "생활", to: "겨울 소재" }, "PATCH")).data as { moved: number }).moved).toBe(2);
    const after = (await j<{ items: S[]; folders: { name: string }[] }>("/api/scraps")).data;
    expect(after.folders.map((x) => x.name)).toContain("겨울 소재");
    // YouTube 찜 목록에는 NAVER·Instagram 스크랩이 섞이지 않는다
    const yt = (await j<{ source: string }[]>("/api/trends/youtube/saved")).data;
    expect(yt.every((x) => x.source === "youtube")).toBe(true);
    for (const x of [ig, nv]) await j(`/api/scraps/${x.id}`, { method: "DELETE" });
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
