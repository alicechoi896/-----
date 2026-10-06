import "server-only";
import { AppError } from "../http";
import { getAIProvider } from "../providers/registry";
import type { ChatContentPart } from "../providers/types";
import { safeFetch } from "../security/safe-url";

/**
 * YouTube 썸네일 문구 읽기 (v0.9.50) — 트렌드 찾기 [대본 포맷에 담기]에서 '썸네일 문구도 함께'를 고르면 부른다.
 * - 썸네일 이미지(i.ytimg.com 공개 주소)를 받아 AI Vision 으로 큰 글자만 읽는다. 이미지는 저장하지 않는다.
 * - 한 번에 최대 10개, 8장씩 묶어 AI 호출 (10개 = AI 2회). YouTube API 호출 0회.
 * - 같은 영상은 24시간 기억 (서버 메모리) → 다시 담아도 AI 0회.
 * - 영상 대본(자막)은 YouTube API 로 남의 영상 자막을 받을 수 없어 읽지 않는다 (Hook·CTA 추출 없음).
 */
export const thumbnailTextConfig = { maxVideos: 10, perCall: 8, cacheMs: 24 * 60 * 60 * 1000, maxImageBytes: 2_000_000 } as const;

const cache = new Map<string, { at: number; text: string }>();
const ID = /^[\w-]{11}$/;

export const thumbnailTextService = {
  async read(videoIds: unknown): Promise<{ texts: Record<string, string>; aiCalls: number }> {
    const ids = [...new Set((Array.isArray(videoIds) ? videoIds : []).map(String).filter((x) => ID.test(x)))].slice(0, thumbnailTextConfig.maxVideos);
    if (!ids.length) throw new AppError("VALIDATION", "썸네일을 읽을 영상이 없습니다.");
    const ai = await getAIProvider();
    if (!ai.supportsVision) {
      throw new AppError("VISION_REQUIRED", "썸네일 글자 읽기는 실제 AI 가 필요합니다. 설정 → API 연결 센터에서 Claude 또는 OpenAI 를 연결해 주세요.", 400);
    }
    const texts: Record<string, string> = {};
    const todo: string[] = [];
    for (const id of ids) {
      const hit = cache.get(id);
      if (hit && Date.now() - hit.at < thumbnailTextConfig.cacheMs) texts[id] = hit.text;
      else todo.push(id);
    }
    // 썸네일 받기 (실패한 것은 건너뛴다)
    const images: { id: string; mediaType: "image/jpeg" | "image/png" | "image/webp"; data: string }[] = [];
    for (const id of todo) {
      try {
        const res = await safeFetch(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`, { signal: AbortSignal.timeout(8000) });
        const type = (res.headers.get("content-type") ?? "").split(";")[0];
        if (!res.ok || !/^image\/(jpeg|png|webp)$/.test(type)) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 500 || buf.length > thumbnailTextConfig.maxImageBytes) continue;
        images.push({ id, mediaType: type as "image/jpeg", data: buf.toString("base64") });
      } catch {
        /* 건너뛴다 */
      }
    }
    let aiCalls = 0;
    for (let i = 0; i < images.length; i += thumbnailTextConfig.perCall) {
      const batch = images.slice(i, i + thumbnailTextConfig.perCall);
      const parts: ChatContentPart[] = [
        ...batch.map((b): ChatContentPart => ({ type: "image", mediaType: b.mediaType, data: b.data })),
        {
          type: "text",
          text: [
            `위 YouTube 썸네일 ${batch.length}장을 순서대로 본다.`,
            "썸네일에 크게 적힌 문구(썸네일 제목)만 그대로 옮겨 적는다. 채널 로고·작은 글자·워터마크는 빼고, 여러 줄이면 한 줄로 이어 쓴다.",
            "글자가 없으면 '-' 만 쓴다. 설명·추측을 덧붙이지 않는다.",
            `형식: 한 줄에 하나씩 '번호: 문구' (1: … 부터 ${batch.length}: … 까지).`,
          ].join("\n"),
        },
      ];
      try {
        aiCalls++;
        const { text } = await ai.generateText({
          task: "youtube-thumbnail-text",
          messages: [
            { role: "system", content: "당신은 이미지 속 글자를 정확히 옮겨 적는 도우미다. 보이지 않는 글자는 만들지 않는다." },
            { role: "user", content: parts },
          ],
          maxTokens: 800,
        });
        for (const line of text.split("\n")) {
          const m = line.match(/^\s*(\d+)\s*[:.)]\s*(.+)$/);
          if (!m) continue;
          const b = batch[Number(m[1]) - 1];
          const t = m[2].replace(/^["'“”]+|["'“”]+$/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
          if (!b || !t || t === "-") continue;
          texts[b.id] = t;
          cache.set(b.id, { at: Date.now(), text: t });
        }
      } catch {
        /* 이 묶음은 건너뛴다 */
      }
    }
    if (cache.size > 2000) cache.delete(cache.keys().next().value!);
    return { texts, aiCalls };
  },
};
