import "server-only";
import { AppError } from "../../http";

/**
 * OpenAI 이미지 편집 (gpt-image-1, /v1/images/edits).
 * 제품 사진의 "배경만" 바꾼다. Claude 는 이미지를 만들 수 없어 기본 AI 와 상관없이 OpenAI 키를 쓴다.
 * 사진은 이 요청 안에서만 쓰고 저장하지 않는다.
 */
const EDIT_URL = "https://api.openai.com/v1/images/edits";

export async function editProductPhotoWithOpenAI(apiKey: string, jpegBase64: string, prompt: string): Promise<{ b64: string; mediaType: string }> {
  const bytes = Buffer.from(jpegBase64, "base64");
  const form = new FormData();
  form.append("model", "gpt-image-1");
  form.append("image", new Blob([bytes], { type: "image/jpeg" }), "product.jpg");
  form.append("prompt", prompt);
  form.append("size", "auto");
  form.append("quality", "medium");
  form.append("output_format", "jpeg");
  form.append("input_fidelity", "high"); // 원본(제품)의 세부를 최대한 유지
  let res: Response;
  try {
    res = await fetch(EDIT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(110_000),
    });
  } catch (e) {
    const timeout = e instanceof Error && e.name === "TimeoutError";
    throw new AppError("AI_TIMEOUT", timeout ? "AI 이미지 편집이 오래 걸려 멈췄습니다. 잠시 후 다시 시도해 주세요." : "OpenAI 에 연결하지 못했습니다.", 504);
  }
  const data = (await res.json().catch(() => null)) as { data?: { b64_json?: string }[]; error?: { message?: string; code?: string } } | null;
  if (!res.ok) {
    const msg = data?.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 401) throw new AppError("AI_AUTH", "OpenAI API Key 가 올바르지 않습니다. API 연결 센터에서 확인해 주세요.", 400);
    if (res.status === 403) throw new AppError("AI_FORBIDDEN", `이 OpenAI 계정은 이미지 모델(gpt-image-1)을 쓸 수 없습니다. OpenAI 조직 인증(Verify Organization)이 필요할 수 있습니다. (${msg})`, 400);
    if (res.status === 429) throw new AppError("AI_RATE", "OpenAI 호출 한도·잔액을 확인해 주세요.", 429);
    if (data?.error?.code === "moderation_blocked") throw new AppError("AI_BLOCKED", "OpenAI 안전 정책으로 이 사진은 편집할 수 없습니다.", 400);
    throw new AppError("AI_ERROR", `AI 이미지 편집에 실패했습니다. (${msg})`, 502);
  }
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new AppError("AI_ERROR", "AI 이미지 편집 결과가 비어 있습니다.", 502);
  return { b64, mediaType: "image/jpeg" };
}
