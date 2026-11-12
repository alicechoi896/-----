import { afterEach, describe, expect, it, vi } from "vitest";
import { UplikaProvider, parsePost } from "@/lib/server/providers/uplika";

/** v0.9.195 업리카: 계정 목록 → 영상 presign·PUT·complete → 게시(Idempotency-Key) 순서와 응답 읽기 (가짜 서버) */
afterEach(() => vi.unstubAllGlobals());

describe("업리카 연결", () => {
  it("계정·영상 올리기·게시를 차례로 부르고 키는 Bearer 헤더로만 보낸다", async () => {
    const calls: { url: string; method: string; headers: Record<string, string>; body?: string }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>));
      calls.push({ url, method: init.method ?? "GET", headers, body: typeof init.body === "string" ? init.body : undefined });
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
      if (url.endsWith("/v1/accounts")) return json({ data: [{ id: "acc_1", platform: "instagram", handle: "shop", displayName: "Shop", status: "active" }] });
      if (url.endsWith("/v1/media/presign")) return json({ id: "med_1", uploadUrl: "https://storage.example/put?sig=1", contentType: "video/mp4" });
      if (url.startsWith("https://storage.example/")) return new Response(null, { status: 200 });
      if (url.endsWith("/v1/media/med_1/complete")) return json({ id: "med_1" });
      if (url.endsWith("/v1/posts")) return json({ id: "post_1", status: "publishing", targets: [{ platform: "instagram", status: "publishing" }] }, 202);
      return json({ error: { message: "not found" } }, 404);
    });
    const p = new UplikaProvider("sk_test");
    const { accounts } = await p.accounts();
    expect(accounts[0]).toMatchObject({ id: "acc_1", platform: "instagram" });
    const media = await p.uploadVideo(Buffer.from("mp4"), "a.mp4");
    const post = await p.publish({ content: "캡션", accountIds: ["acc_1"], mediaIds: [media], options: { instagram: { contentType: "reel" } } }, "wa-req-1");
    expect(post).toMatchObject({ id: "post_1", status: "publishing" });
    // 서명된 저장소 주소에는 키를 보내지 않는다
    const put = calls.find((c) => c.url.startsWith("https://storage.example/"))!;
    expect(put.method).toBe("PUT");
    expect(JSON.stringify(put.headers)).not.toContain("sk_test");
    const pub = calls.find((c) => c.url.endsWith("/v1/posts"))!;
    expect(pub.headers.authorization).toBe("Bearer sk_test");
    expect(pub.headers["Idempotency-Key"]).toBe("wa-req-1");
    expect(JSON.parse(pub.body!)).toMatchObject({ mediaIds: ["med_1"], options: { instagram: { contentType: "reel" } } });
  });

  it("게시 결과: 주소·오류를 읽는다", () => {
    const r = parsePost({ id: "post_1", status: "partial", targets: [{ platform: "instagram", status: "published", url: "https://instagram.com/reel/x" }, { platform: "tiktok", status: "failed", error: { message: "bad" } }] });
    expect(r.targets[0].url).toBe("https://instagram.com/reel/x");
    expect(r.targets[1].error).toBe("bad");
  });

  it("키가 틀리면 401 을 그대로 알려 준다", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: { message: "Authorization required." } }), { status: 401 }));
    const t = await new UplikaProvider("bad").testConnection();
    expect(t.ok).toBe(false);
    expect(t.message).toContain("API 키");
  });
});
