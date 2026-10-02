import "server-only";
import type { AuditAction, AuditLog, SessionInfo } from "@/lib/types";
import { createId, nowIso } from "@/lib/utils";
import { getRepositories } from "../repositories";

interface AuditInput {
  action: AuditAction;
  targetType: AuditLog["targetType"];
  targetId?: string | null;
  targetLabel?: string | null;
  detail?: Record<string, unknown>;
}

/**
 * 활동 기록 (감사 로그).
 * - 기록에 실패해도 본래 작업은 막지 않는다 (서버 로그에만 남김)
 * - 수행자(actor)의 이메일·이름을 복사해 두어, 탈퇴한 사용자의 기록도 읽을 수 있다
 * - Supabase 에서는 본인 명의로만 기록할 수 있고(RLS), 조회는 관리자만 된다
 */
export const auditService = {
  async log(actor: SessionInfo, input: AuditInput): Promise<void> {
    const entry: AuditLog = {
      id: createId("log"),
      actorId: actor.user.id,
      actorEmail: actor.user.email,
      actorName: actor.user.name,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      targetLabel: input.targetLabel ?? null,
      detail: input.detail ?? {},
      createdAt: nowIso(),
    };
    try {
      await getRepositories().auditLogs.insert(entry);
    } catch (e) {
      console.error("[audit] failed to write log", input.action, e instanceof Error ? e.message : e);
    }
  },

  async list(): Promise<AuditLog[]> {
    const logs = await getRepositories().auditLogs.list();
    return logs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
};
