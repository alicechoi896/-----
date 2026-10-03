import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import type { ErrorLog } from "@/lib/types";
import { createId, nowIso } from "@/lib/utils";
import { getSession } from "../auth";
import { getRepositories } from "../repositories";

/**
 * 오류 기록 (error_logs). 기록하다 실패해도 원래 요청에는 영향을 주지 않는다 (조용히 무시).
 * - 비밀값(API 키·토큰·이메일 외 개인정보 패턴)은 저장 전에 가린다
 * - 같은 오류가 폭주하지 않게 1분에 한 번만 (서버 인스턴스마다)
 */

const THROTTLE_MS = 60_000;
const recent = new Map<string, number>();

/** API 키·토큰처럼 보이는 문자열을 가린다 */
export function scrubSecrets(text: string): string {
  return text
    .replace(/sk-(?:ant-)?[A-Za-z0-9_-]{10,}/g, "sk-***")
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "AIza***")
    .replace(/Bearer\s+[A-Za-z0-9._-]{10,}/gi, "Bearer ***")
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, "eyJ***(JWT)")
    .replace(/(secret|password|token|apikey|api_key)(["'\s:=]+)[^\s"',}]{4,}/gi, "$1$2***");
}

export function errorFingerprint(message: string, stack: string): string {
  const firstFrame = stack.split("\n").find((l) => /at\s/.test(l))?.trim() ?? "";
  return createHash("sha1").update(`${message.slice(0, 200)}|${firstFrame.slice(0, 200)}`).digest("hex").slice(0, 16);
}

export interface CaptureInput {
  source: ErrorLog["source"];
  error?: unknown;
  message?: string;
  stack?: string;
  path?: string;
  method?: string;
  code?: string;
  status?: number | null;
}

export const errorLogService = {
  async capture(input: CaptureInput): Promise<void> {
    try {
      const err = input.error instanceof Error ? input.error : null;
      const message = scrubSecrets(String(input.message ?? err?.message ?? input.error ?? "알 수 없는 오류")).slice(0, 1000);
      const stack = scrubSecrets(String(input.stack ?? err?.stack ?? "")).slice(0, 6000);
      const fingerprint = errorFingerprint(message, stack);
      const now = Date.now();
      if ((recent.get(fingerprint) ?? 0) > now - THROTTLE_MS) return;
      recent.set(fingerprint, now);
      if (recent.size > 1000) recent.delete(recent.keys().next().value!);

      const h = await headers().catch(() => null);
      const session = await getSession().catch(() => null);
      const row: ErrorLog = {
        id: createId("err"),
        source: input.source,
        path: (input.path ?? h?.get("x-pathname") ?? "").slice(0, 300),
        method: (input.method ?? h?.get("x-method") ?? "").slice(0, 10),
        code: (input.code ?? "").slice(0, 60),
        status: input.status ?? null,
        message,
        stack,
        fingerprint,
        userId: session?.user.id ?? null,
        userEmail: session?.user.email ?? "",
        userAgent: (h?.get("user-agent") ?? "").slice(0, 300),
        createdAt: nowIso(),
      };
      await getRepositories().errorLogs.insert(row);
    } catch (e) {
      console.error("[error-log] 기록 실패", e instanceof Error ? e.message : e);
    }
  },

  async list(days = 30): Promise<ErrorLog[]> {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const rows = await getRepositories().errorLogs.list((r) => r.createdAt >= since);
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 1000);
  },

  async remove(ids: string[] | "all"): Promise<number> {
    const repo = getRepositories().errorLogs;
    const rows = ids === "all" ? await repo.list() : await repo.list((r) => ids.includes(r.id));
    let n = 0;
    for (const r of rows) if (await repo.remove(r.id)) n++;
    return n;
  },
};
