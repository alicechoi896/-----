import "server-only";
import type { ConnectionTestResult } from "@/lib/types";
import { nowIso } from "@/lib/utils";
import type { TTSProvider } from "./openai-tts";

/**
 * AI 음성 — 타입캐스트 (v0.9.73, Neosapience). docs/VIDEO_PRODUCTION.md
 * - 음성: POST https://api.typecast.ai/v1/text-to-speech (X-API-KEY) → 오디오 그대로 (mp3)
 *   { voice_id "tc_…"|"uc_…", text ≤2000, model "ssfm-v30", language "kor", prompt { emotion_type "preset", emotion_preset, emotion_intensity }, output { audio_format "mp3" } }
 * - 목소리 목록: GET /v3/voices?model=ssfm-v30 (무료)
 * - 연결 확인: GET /v1/users/me/subscription (무료, 플랜·남은 크레딧)
 * 1글자 = 1크레딧. 무료 플랜은 상업적 사용 불가 (유료 Lite 부터). 키는 헤더로만, 로그·오류에 넣지 않는다.
 */
const BASE = "https://api.typecast.ai";
const MODEL = "ssfm-v30";
export const TYPECAST_EMOTIONS = [
  { value: "normal", label: "보통" },
  { value: "happy", label: "밝게" },
  { value: "toneup", label: "톤 업 (신나게)" },
  { value: "tonedown", label: "톤 다운 (차분하게)" },
  { value: "whisper", label: "속삭이듯" },
  { value: "sad", label: "슬프게" },
  { value: "angry", label: "화나게" },
] as const;
export const TYPECAST_VOICE_ID = /^(tc|uc)_[a-z0-9]{8,40}$/;

export interface TypecastVoice {
  id: string;
  name: string;
  gender: string | null;
  age: string | null;
  useCases: string[];
  previewUrl: string | null;
  emotions: string[];
  custom: boolean;
}

function errorOf(status: number): Error {
  if (status === 401 || status === 403) return new Error("타입캐스트 API 키가 올바르지 않습니다 (예전 Starter 키는 쓸 수 없음). API 연결 센터에서 확인해 주세요.");
  if (status === 402) return new Error("타입캐스트 크레딧이 부족합니다. 타입캐스트에서 충전하거나 요금제를 올려 주세요.");
  if (status === 404) return new Error("타입캐스트 목소리를 찾지 못했습니다. 목소리를 다시 골라 주세요.");
  if (status === 429) return new Error("타입캐스트 동시 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.");
  if (status === 400 || status === 422) return new Error("타입캐스트가 요청을 받지 않았습니다 (글자 수·감정 설정 확인).");
  return new Error(`타입캐스트 오류 (HTTP ${status}).`);
}

export class TypecastTTSProvider implements TTSProvider {
  readonly id = "typecast";
  readonly label = "타입캐스트";
  constructor(private readonly apiKey: string) {}

  private headers(json = false): Record<string, string> {
    return { "X-API-KEY": this.apiKey, Accept: json ? "application/json" : "*/*", ...(json ? { "Content-Type": "application/json" } : {}) };
  }

  /** instructions 는 OpenAI 말투용 — 타입캐스트는 emotion(감정) 을 쓴다 */
  async synthesize(text: string, voice: string, _instructions?: string, opts?: { emotion?: string }): Promise<Buffer> {
    if (!TYPECAST_VOICE_ID.test(voice)) throw new Error("타입캐스트 목소리를 골라 주세요.");
    const emotion = TYPECAST_EMOTIONS.some((e) => e.value === opts?.emotion) ? opts!.emotion! : "normal";
    const res = await fetch(`${BASE}/v1/text-to-speech`, {
      method: "POST",
      headers: this.headers(true),
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        voice_id: voice,
        text: text.slice(0, 2000),
        model: MODEL,
        language: "kor",
        prompt: { emotion_type: "preset", emotion_preset: emotion, emotion_intensity: 1 },
        output: { audio_format: "mp3" },
      }),
    });
    if (!res.ok) throw errorOf(res.status);
    return Buffer.from(await res.arrayBuffer());
  }

  async listVoices(): Promise<TypecastVoice[]> {
    const res = await fetch(`${BASE}/v3/voices?model=${MODEL}`, { headers: this.headers(true), cache: "no-store", signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw errorOf(res.status);
    const list = (await res.json().catch(() => [])) as Record<string, unknown>[];
    return (Array.isArray(list) ? list : []).map((v) => {
      const name = v.voice_name as { kor?: string; eng?: string } | string | undefined;
      const models = Array.isArray(v.models) ? (v.models as { version?: string; emotions?: string[] }[]) : [];
      return {
        id: String(v.voice_id ?? ""),
        name: typeof name === "string" ? name : (name?.kor || name?.eng || String(v.voice_id ?? "")),
        gender: typeof v.gender === "string" ? v.gender : null,
        age: typeof v.age === "string" ? v.age : null,
        useCases: Array.isArray(v.use_cases) ? (v.use_cases as string[]).slice(0, 5) : [],
        previewUrl: typeof v.preview_url === "string" ? v.preview_url : null,
        emotions: models.find((m) => m.version === MODEL)?.emotions ?? [],
        custom: v.voice_type === "custom",
      };
    }).filter((v) => TYPECAST_VOICE_ID.test(v.id));
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const res = await fetch(`${BASE}/v1/users/me/subscription`, { headers: this.headers(true), cache: "no-store", signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw errorOf(res.status);
      const j = (await res.json()) as { plan?: string; credits?: { plan_credits?: number; used_credits?: number } };
      const left = (j.credits?.plan_credits ?? 0) - (j.credits?.used_credits ?? 0);
      return {
        ok: true,
        message: `플랜 ${j.plan ?? "-"} · 남은 크레딧 ${left.toLocaleString()} (1글자 = 1크레딧)${j.plan === "free" ? " · 무료 플랜은 상업적 사용 불가" : ""}`,
        testedAt: nowIso(),
        mock: false,
      };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "연결을 확인하지 못했습니다.", testedAt: nowIso(), mock: false };
    }
  }
}
