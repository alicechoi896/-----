import "server-only";
import { headers } from "next/headers";

/**
 * 로그인·회원가입 반복 시도 막기.
 * - 15분 안에 같은 IP 또는 같은 이메일로 5번 넘게 시도하면 Cloudflare Turnstile(무료 캡차)을 풀어야 한다
 *   (로그인은 실패만, 가입은 모든 시도를 센다)
 * - 캡차 키(TURNSTILE_SECRET_KEY, NEXT_PUBLIC_TURNSTILE_SITE_KEY)가 없으면 15분 동안 막는다
 * - 캡차를 풀어도 15분에 30번을 넘으면 막는다 (봇이 캡차 풀이 서비스를 쓰는 경우)
 * 서버 인스턴스마다 따로 세는 간단한 방식이다 (rate-limit.ts 와 같음). Supabase 자체 한도도 함께 걸린다.
 */

export type AuthAttemptKind = "login" | "signup";

const WINDOW_MS = 15 * 60_000;
export const CAPTCHA_AFTER = 5;
const HARD_LIMIT = 30;
const attempts = new Map<string, number[]>();

export const captchaEnabled = () => Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

function keysFor(kind: AuthAttemptKind, ip: string, email: string): string[] {
  const keys = [`${kind}:ip:${ip}`];
  if (email) keys.push(`${kind}:email:${email.toLowerCase()}`);
  return keys;
}

function recent(key: string, now: number): number[] {
  return (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
}

function count(keys: string[], now = Date.now()): number {
  return Math.max(0, ...keys.map((k) => recent(k, now).length));
}

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  try {
    const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY ?? "", response: token });
    if (ip !== "unknown") body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

export interface AuthGuard {
  /** 막혔으면 사용자에게 보여 줄 문구와 캡차 표시 여부 */
  blocked: { error: string; captcha: boolean } | null;
  /** 시도 1번 기록. 기록 후 캡차가 필요해졌는지 돌려준다 */
  record(): boolean;
  /** 성공하면 이 이메일·IP 기록을 지운다 */
  clear(): void;
}

export async function checkAuthAttempt(kind: AuthAttemptKind, email: string, formData: FormData): Promise<AuthGuard> {
  const ip = await clientIp();
  const keys = keysFor(kind, ip, email);
  const now = Date.now();
  const n = count(keys, now);
  const wait = () => {
    const oldest = Math.min(...keys.map((k) => recent(k, now)[0] ?? now));
    return Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 60_000));
  };

  const guard: AuthGuard = {
    blocked: null,
    record() {
      const t = Date.now();
      for (const k of keys) attempts.set(k, [...recent(k, t), t]);
      if (attempts.size > 10_000) for (const [k, v] of attempts) if (!v.some((x) => t - x < WINDOW_MS)) attempts.delete(k);
      return captchaEnabled() && count(keys, t) >= CAPTCHA_AFTER;
    },
    clear() {
      for (const k of keys) attempts.delete(k);
    },
  };

  if (n >= HARD_LIMIT || (n >= CAPTCHA_AFTER && !captchaEnabled())) {
    guard.blocked = { error: `시도가 너무 많습니다. ${wait()}분 뒤에 다시 시도해 주세요.`, captcha: false };
  } else if (n >= CAPTCHA_AFTER) {
    const token = String(formData.get("cf-turnstile-response") ?? "");
    if (!token) guard.blocked = { error: "시도가 많아 보안 확인이 필요합니다. 아래 확인을 완료한 뒤 다시 눌러 주세요.", captcha: true };
    else if (!(await verifyTurnstile(token, ip))) guard.blocked = { error: "보안 확인에 실패했습니다. 다시 확인해 주세요.", captcha: true };
  }
  return guard;
}
