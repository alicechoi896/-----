import "server-only";

/**
 * TikHub 공용 HTTP (샤오홍슈·도우인 Provider 가 같이 쓴다). docs/SOCIAL_VIDEO_SOURCING.md
 * - Host https://api.tikhub.io, 인증 Authorization: Bearer {키} — 서버에서만, 키를 로그·오류 메시지에 넣지 않는다
 * - 오류는 화면용 문장으로 바꾼다 (401 키 / 403 권한 / 402 잔액 / 429 한도 / 시간 초과 / 응답 오류)
 */
export const TIKHUB_BASE = "https://api.tikhub.io";
const TIMEOUT_MS = 30_000;

export type TikHubErrorCode = "NOT_CONNECTED" | "AUTH" | "PAYMENT" | "RATE_LIMIT" | "TIMEOUT" | "UPSTREAM" | "BAD_RESPONSE";

export class TikHubError extends Error {
  constructor(
    public code: TikHubErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export async function tikhubRequest(
  apiKey: string,
  method: "GET" | "POST",
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams();
  const body: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    if (method === "GET") {
      if (v !== "") qs.set(k, String(v));
    } else body[k] = v;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${TIKHUB_BASE}${path}${method === "GET" && qs.size ? `?${qs.toString()}` : ""}`, {
      method,
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json", ...(method === "POST" ? { "Content-Type": "application/json" } : {}) },
      body: method === "POST" ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      cache: "no-store",
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new TikHubError("TIMEOUT", "TikHub 응답이 30초 안에 오지 않았습니다. 잠시 후 다시 시도해 주세요.");
    throw new TikHubError("UPSTREAM", "TikHub 에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401) throw new TikHubError("AUTH", "TikHub API Key 가 올바르지 않거나 만료되었습니다. API 연결 센터에서 키를 확인해 주세요.");
  if (res.status === 403) throw new TikHubError("AUTH", "TikHub 계정에 이 기능 권한이 없습니다 (계정 비활성·이메일 미인증·키 권한). TikHub 대시보드를 확인해 주세요.");
  if (res.status === 402) throw new TikHubError("PAYMENT", "TikHub 잔액(크레딧)이 부족합니다. TikHub 에서 충전한 뒤 다시 시도해 주세요.");
  if (res.status === 429) throw new TikHubError("RATE_LIMIT", "TikHub 요청이 너무 많습니다 (초당 10회 제한). 잠시 후 다시 시도해 주세요.");
  if (!res.ok) throw new TikHubError("UPSTREAM", `TikHub 응답 오류 (HTTP ${res.status}). 잠시 후 다시 시도해 주세요.`);
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!json) throw new TikHubError("BAD_RESPONSE", "TikHub 응답을 읽지 못했습니다.");
  if (typeof json.code === "number" && json.code !== 200) throw new TikHubError("UPSTREAM", `TikHub 오류 (code ${json.code}). 잠시 후 다시 시도해 주세요.`);
  return json;
}

/** 계정 확인 (무료 엔드포인트) — API 연결 센터 [테스트] */
export async function tikhubAccountSummary(apiKey: string): Promise<string> {
  const body = (await tikhubRequest(apiKey, "GET", "/api/v1/tikhub/user/get_user_info")) as { data?: { user_data?: { balance?: number; free_credit?: number } } };
  const u = body.data?.user_data;
  return u ? `잔액 $${Number(u.balance ?? 0).toFixed(2)}${u.free_credit ? ` (무료 크레딧 $${Number(u.free_credit).toFixed(2)})` : ""}` : "";
}
