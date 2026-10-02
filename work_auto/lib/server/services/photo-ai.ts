import "server-only";
import { PHOTO_AI_STYLE_OPTIONS } from "@/lib/photo-ai-styles";
import { serverConfig } from "../config";
import { AppError } from "../http";
import { loadCredentials } from "../providers/registry";
import { editProductPhotoWithOpenAI } from "../providers/image/openai-image";

/**
 * 제품 사진 AI 배경 연출 (블로그 제품 글). 배경과 조명만 바꾸고 제품은 그대로 두도록 지시한다.
 * 실제와 다른 사진은 과장 광고가 될 수 있어 화면에서 확인을 안내하고, 사진 설명에 "AI 배경 연출"을 붙인다.
 */
const label = (v: string) => PHOTO_AI_STYLE_OPTIONS.find((o) => o.value === v)?.label ?? v;

export const PHOTO_AI_STYLES: Record<string, { label: string; scene: string }> = {
  studio: { label: label("studio"), scene: "a clean seamless white studio background with a soft natural shadow" },
  living: { label: label("living"), scene: "a bright modern living room, placed on a light wooden table, soft natural daylight" },
  desk: { label: label("desk"), scene: "a tidy minimal desk near a window, soft morning light" },
  kitchen: { label: label("kitchen"), scene: "a clean bright kitchen counter, natural daylight" },
  outdoor: { label: label("outdoor"), scene: "a calm outdoor setting with soft sunlight and blurred greenery in the background" },
};

const MAX_B64 = 3_000_000; // 약 2.2MB (요청 4.5MB 제한 안쪽)

export const photoAiService = {
  async edit(input: { image?: string; style?: string }): Promise<{ image: string; mediaType: string; demo: boolean; styleLabel: string }> {
    const style = PHOTO_AI_STYLES[String(input.style ?? "")];
    if (!style) throw new AppError("VALIDATION", "배경을 골라 주세요.");
    const image = String(input.image ?? "");
    if (!image || image.length > MAX_B64 || !/^[A-Za-z0-9+/=]+$/.test(image.slice(0, 200))) throw new AppError("VALIDATION", "사진을 다시 올려 주세요. (2MB 이하 JPEG)");
    // 데모 모드: 외부 호출 없이 원본을 돌려준다 (화면 흐름 확인용)
    if (serverConfig.providerMode !== "live") return { image, mediaType: "image/jpeg", demo: true, styleLabel: style.label };
    const cred = await loadCredentials("openai");
    if (!cred) {
      throw new AppError("NEED_OPENAI", "AI 배경 연출은 OpenAI 이미지 모델을 씁니다 (Claude 는 이미지를 만들 수 없음). API 연결 센터에서 OpenAI 를 연결해 주세요.", 400);
    }
    const prompt = [
      `Place this exact product in ${style.scene}.`,
      "Keep the product exactly as in the photo: same shape, proportions, color, material, logos, printed text, buttons and parts.",
      "Do not add, remove, redraw or restyle any part of the product. Do not add any text, watermark, hands or people.",
      "Only change the background, surface and lighting around the product. Photorealistic e-commerce product photo.",
    ].join(" ");
    const out = await editProductPhotoWithOpenAI(cred.apiKey, image, prompt);
    return { image: out.b64, mediaType: out.mediaType, demo: false, styleLabel: style.label };
  },
};
