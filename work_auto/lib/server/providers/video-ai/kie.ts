import "server-only";
import type { ConnectionTestResult } from "@/lib/types";
import type { AiClipState } from "@/lib/types/video-production";
import { AI_CLIP_CONFIG } from "@/lib/video-production/config";
import { nowIso } from "@/lib/utils";

/**
 * AI 영상 Provider (v0.9.60) — Kie AI. docs/VIDEO_PRODUCTION.md
 * - 작업 만들기: POST https://api.kie.ai/api/v1/jobs/createTask { model, input } → data.taskId (이 1번이 과금)
 * - 상태: GET /api/v1/jobs/recordInfo?taskId= (무료) → data.state waiting|queuing|generating|success|fail,
 *         data.resultJson = '{"resultUrls":["…mp4"]}', creditsConsumed, failMsg
 * - 사진 올리기: POST https://kieai.redpandaai.co/api/file-base64-upload (무료, 24시간 뒤 삭제) → data.downloadUrl
 * - 잔액: GET /api/v1/chat/credit (무료) → data = 남은 크레딧
 * - 오류는 HTTP 200 + 본문 code (401 키 / 402 잔액 / 422 입력 / 429 요청 많음 / 455 점검 / 501 생성 실패)
 * 키는 Authorization 헤더로만 보내고 로그·오류에 넣지 않는다. 자동 재시도 없음.
 */
const API = "https://api.kie.ai";
const UPLOAD = "https://kieai.redpandaai.co";
const TIMEOUT_MS = 30_000;

export class VideoAIError extends Error {
  constructor(
    public code: "AUTH" | "PAYMENT" | "VALIDATION" | "RATE_LIMIT" | "UNAVAILABLE" | "TIMEOUT" | "UPSTREAM",
    message: string,
  ) {
    super(message);
  }
}

export interface ClipStatus {
  state: AiClipState;
  resultUrl: string | null;
  credits: number | null;
  error: string | null;
}

export interface VideoAIProvider {
  readonly id: string;
  /** 제품 사진(9:16 JPEG) → 5초 영상 작업. 반환: taskId */
  createProductClip(input: { prompt: string; image: Buffer }): Promise<{ taskId: string; model: string }>;
  /** 글 → 9:16 5초 장면 작업 */
  createTextClip(input: { prompt: string }): Promise<{ taskId: string; model: string }>;
  /** 작업 상태 (무료) */
  status(taskId: string): Promise<ClipStatus>;
}

type Obj = Record<string, unknown>;

function errorOf(code: number, msg: string): VideoAIError {
  if (code === 401) return new VideoAIError("AUTH", "Kie AI API Key 가 올바르지 않습니다. API 연결 센터에서 키를 확인해 주세요.");
  if (code === 402) return new VideoAIError("PAYMENT", "Kie AI 크레딧이 부족합니다. kie.ai 에서 충전한 뒤 다시 눌러 주세요.");
  if (code === 422 || code === 400) return new VideoAIError("VALIDATION", `Kie AI 가 요청을 받지 않았습니다 (${msg.slice(0, 120) || "입력 오류"}).`);
  if (code === 429) return new VideoAIError("RATE_LIMIT", "Kie AI 요청이 너무 많습니다. 잠시 후 다시 눌러 주세요.");
  if (code === 455 || code === 505) return new VideoAIError("UNAVAILABLE", "Kie AI 가 점검 중이거나 이 기능을 쓸 수 없습니다. 잠시 후 다시 시도해 주세요.");
  return new VideoAIError("UPSTREAM", `Kie AI 오류 (code ${code}${msg ? `: ${msg.slice(0, 100)}` : ""}).`);
}

export class KieVideoProvider implements VideoAIProvider {
  readonly id = "kie";
  readonly label = "Kie AI";
  constructor(private readonly apiKey: string) {}

  private async call(url: string, init: { method: "GET" | "POST"; body?: Obj }): Promise<Obj> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        method: init.method,
        headers: { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
        body: init.body ? JSON.stringify(init.body) : undefined,
        signal: ctrl.signal,
        cache: "no-store",
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw new VideoAIError("TIMEOUT", "Kie AI 응답이 30초 안에 오지 않았습니다. 잠시 후 다시 눌러 주세요.");
      throw new VideoAIError("UPSTREAM", "Kie AI 에 연결하지 못했습니다.");
    } finally {
      clearTimeout(timer);
    }
    const json = (await res.json().catch(() => null)) as Obj | null;
    if (!json) throw new VideoAIError("UPSTREAM", `Kie AI 응답을 읽지 못했습니다 (HTTP ${res.status}).`);
    const code = Number(json.code ?? res.status);
    if (code !== 200) throw errorOf(code, String(json.msg ?? ""));
    return json;
  }

  /** 9:16 사진 올리기 (무료, 24시간 뒤 Kie 가 지운다) */
  private async upload(image: Buffer): Promise<string> {
    const body = await this.call(`${UPLOAD}/api/file-base64-upload`, {
      method: "POST",
      body: { base64Data: `data:image/jpeg;base64,${image.toString("base64")}`, uploadPath: "work-auto", fileName: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg` },
    });
    const url = (body.data as Obj | undefined)?.downloadUrl;
    if (typeof url !== "string" || !url) throw new VideoAIError("UPSTREAM", "Kie AI 에 사진을 올리지 못했습니다.");
    return url;
  }

  private async create(model: string, input: Obj): Promise<{ taskId: string; model: string }> {
    const body = await this.call(`${API}/api/v1/jobs/createTask`, { method: "POST", body: { model, input } });
    const taskId = (body.data as Obj | undefined)?.taskId;
    if (typeof taskId !== "string" || !taskId) throw new VideoAIError("UPSTREAM", "Kie AI 가 작업 번호를 주지 않았습니다.");
    return { taskId, model };
  }

  async createProductClip({ prompt, image }: { prompt: string; image: Buffer }) {
    const c = AI_CLIP_CONFIG.product;
    const imageUrl = await this.upload(image);
    return this.create(c.model, { prompt: prompt.slice(0, 1500), image_urls: [imageUrl], duration: c.duration, resolution: c.resolution, audio: false });
  }

  async createTextClip({ prompt }: { prompt: string }) {
    const c = AI_CLIP_CONFIG.text;
    return this.create(c.model, { prompt: prompt.slice(0, 2000), aspect_ratio: c.aspectRatio, resolution: c.resolution, duration: c.duration, camera_fixed: false, seed: -1 });
  }

  async status(taskId: string): Promise<ClipStatus> {
    const body = await this.call(`${API}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, { method: "GET" });
    return parseRecord(body.data as Obj | undefined);
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const body = await this.call(`${API}/api/v1/chat/credit`, { method: "GET" });
      const credits = Number(body.data ?? 0);
      return { ok: true, message: `잔액 ${credits.toLocaleString()} 크레딧 (약 $${(credits * AI_CLIP_CONFIG.creditUsd).toFixed(2)})`, testedAt: nowIso(), mock: false };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "연결을 확인하지 못했습니다.", testedAt: nowIso(), mock: false };
    }
  }
}

/** recordInfo 의 data → 상태 (resultJson 은 JSON 문자열) */
export function parseRecord(d: Obj | undefined): ClipStatus {
  const raw = String(d?.state ?? "waiting");
  const state: AiClipState = raw === "success" ? "success" : raw === "fail" ? "fail" : raw === "generating" ? "generating" : "waiting";
  let resultUrl: string | null = null;
  if (state === "success") {
    const parsed = (() => {
      if (d?.response && typeof d.response === "object") return d.response as Obj;
      try {
        return JSON.parse(String(d?.resultJson ?? "{}")) as Obj;
      } catch {
        return {} as Obj;
      }
    })();
    const urls = parsed.resultUrls;
    resultUrl = Array.isArray(urls) && typeof urls[0] === "string" ? urls[0] : null;
  }
  const credits = d?.creditsConsumed != null && Number.isFinite(Number(d.creditsConsumed)) ? Number(d.creditsConsumed) : null;
  const error = state === "fail" ? `AI 컷을 만들지 못했습니다${d?.failMsg ? ` (${String(d.failMsg).slice(0, 120)})` : ""}.` : state === "success" && !resultUrl ? "결과 영상 주소가 없습니다." : null;
  return { state: state === "success" && !resultUrl ? "fail" : state, resultUrl, credits, error };
}

/** 데모: 바로 끝난 것으로 (결과는 렌더할 때 시험 영상으로 만든다) */
export class MockVideoAIProvider implements VideoAIProvider {
  readonly id = "mock-kie";
  async createProductClip() {
    return { taskId: `mock_${Math.random().toString(36).slice(2, 12)}`, model: AI_CLIP_CONFIG.product.model };
  }
  async createTextClip() {
    return { taskId: `mock_${Math.random().toString(36).slice(2, 12)}`, model: AI_CLIP_CONFIG.text.model };
  }
  async status(): Promise<ClipStatus> {
    return { state: "success", resultUrl: "mock://ai-clip", credits: 20, error: null };
  }
}
