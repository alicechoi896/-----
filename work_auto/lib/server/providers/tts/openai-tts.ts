import "server-only";

/**
 * AI 음성 (v0.9.51): OpenAI Text-to-Speech (POST /v1/audio/speech). API 연결 센터의 OpenAI 키를 그대로 쓴다.
 * - 영상 자동 제작에서 마디(자막 한 줄)마다 1번 부른다 → 마디 길이를 정확히 알 수 있어 컷·자막 시간이 맞는다.
 * - 키는 서버에서만 쓰고 로그·오류 메시지에 남기지 않는다. 다른 TTS 로 바꾸면 이 파일만 바꾼다.
 */
export interface TTSProvider {
  readonly id: string;
  synthesize(text: string, voice: string): Promise<Buffer>;
}

export const TTS_MODEL = "gpt-4o-mini-tts";
const INSTRUCTIONS = "한국어 쇼츠 내레이션. 밝고 또렷하게, 조금 빠른 속도로, 문장 끝을 늘이지 않는다.";

export class OpenAITTSProvider implements TTSProvider {
  readonly id = "openai-tts";
  constructor(private readonly apiKey: string) {}

  async synthesize(text: string, voice: string): Promise<Buffer> {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({ model: TTS_MODEL, voice, input: text.slice(0, 600), instructions: INSTRUCTIONS, response_format: "mp3" }),
    });
    if (!res.ok) throw new Error(`AI 음성을 만들지 못했습니다 (OpenAI HTTP ${res.status}).`);
    return Buffer.from(await res.arrayBuffer());
  }
}
