import "server-only";
import { findFeature } from "@/lib/registry";
import { PUBLICATION_STATUSES, platformForChannel, platformLabel, publicationDate } from "@/lib/publish-platforms";
import type {
  ContentPublication,
  ContentPublicationInput,
  ContentPublicationView,
  ContentUploadState,
  PublicationStatus,
  SessionInfo,
} from "@/lib/types";
import { createId, nowIso } from "@/lib/utils";
import { AppError, notFound } from "../http";
import { getRepositories } from "../repositories";
import { auditService } from "./audit";

/**
 * 콘텐츠 업로드 관리 (docs/UPLOADS.md).
 * - 팀 공용: 승인된 직원은 모두 조회 (Supabase RLS publications_select_team)
 * - 수정: 등록자·담당자·관리자 / 삭제: 등록자·관리자 (서비스와 RLS 가 같이 막는다)
 * - 담당자: 관리자는 승인된 직원 중에서 고르고, 직원이 등록하면 본인
 * - 생성 콘텐츠의 업로드 상태는 이 기록에서 계산한다 (generated_contents 에 따로 저장하지 않는다)
 */

const STATUS_VALUES = PUBLICATION_STATUSES.map((s) => s.value);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function toIso(v: unknown, label: string): string | null {
  if (v == null || v === "") return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new AppError("VALIDATION", `${label} 날짜가 올바르지 않습니다.`);
  return d.toISOString();
}

function toUrl(v: unknown): string | null {
  const s = str(v, 1000);
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
    return u.toString();
  } catch {
    throw new AppError("VALIDATION", "업로드 URL 은 http(s):// 로 시작하는 주소로 넣어 주세요.");
  }
}

const isAdmin = (s: SessionInfo) => s.role === "admin";
const canEdit = (s: SessionInfo, p: ContentPublication) => isAdmin(s) || p.userId === s.user.id || p.assigneeId === s.user.id;
const canDelete = (s: SessionInfo, p: ContentPublication) => isAdmin(s) || p.userId === s.user.id;

async function assigneeFor(session: SessionInfo, requested: unknown, current?: ContentPublication): Promise<{ id: string | null; name: string }> {
  const id = typeof requested === "string" && requested ? requested : null;
  if (!isAdmin(session)) {
    // 직원: 새로 등록하면 본인. 수정할 때는 기존 담당자를 유지한다
    if (current) return { id: current.assigneeId, name: current.assigneeName };
    return { id: session.user.id, name: session.user.name };
  }
  if (!id) return { id: session.user.id, name: session.user.name };
  const profile = await getRepositories().profiles.get(id);
  if (!profile || profile.status !== "active") throw new AppError("VALIDATION", "담당자는 승인된 직원 중에서 골라 주세요.");
  return { id: profile.id, name: profile.name || profile.email };
}

/** 입력 정리 + 기존 콘텐츠·제품 연결 (내 콘텐츠·제품만) */
async function normalize(session: SessionInfo, input: Partial<ContentPublicationInput>, current?: ContentPublication) {
  const repo = getRepositories();
  const contentId = typeof input.contentId === "string" && input.contentId ? input.contentId : null;
  let productId = typeof input.productId === "string" && input.productId ? input.productId : null;
  let title = str(input.title, 200);
  let contentType = str(input.contentType, 60);
  let platform = str(input.platform, 30);

  if (contentId && contentId !== current?.contentId) {
    const content = await repo.contents.get(contentId);
    if (!content || content.userId !== session.user.id) throw new AppError("VALIDATION", "연결할 콘텐츠를 찾을 수 없습니다. 내가 만든 콘텐츠만 연결할 수 있습니다.");
    productId = productId ?? content.productId;
    title = title || content.headline;
    contentType = contentType || (findFeature(content.featureId)?.title ?? "");
    platform = platform || platformForChannel(content.channelId);
  }
  let productName = current && productId === current.productId ? current.productName : "";
  if (productId && productId !== current?.productId) {
    const product = await repo.products.get(productId);
    if (!product || product.userId !== session.user.id) throw new AppError("VALIDATION", "연결할 제품을 찾을 수 없습니다.");
    productName = product.name;
  }
  if (!platform) throw new AppError("VALIDATION", "플랫폼을 골라 주세요.");
  if (!title) throw new AppError("VALIDATION", "콘텐츠 제목을 입력해 주세요.");

  const status = (STATUS_VALUES as string[]).includes(String(input.status)) ? (input.status as PublicationStatus) : "draft";
  let publishedAt = toIso(input.publishedAt, "실제 업로드일");
  const scheduledAt = toIso(input.scheduledAt, "예약일");
  if (status === "scheduled" && !scheduledAt) throw new AppError("VALIDATION", "예약 상태는 예약일을 넣어 주세요.");
  if (status === "published" && !publishedAt) publishedAt = nowIso(); // 업로드 완료인데 날짜가 없으면 지금

  return {
    contentId,
    productId,
    productName,
    platform,
    accountName: str(input.accountName, 60),
    title,
    contentType,
    status,
    scheduledAt,
    publishedAt,
    platformUrl: toUrl(input.platformUrl),
    note: str(input.note, 1000) || null,
  };
}

const view = (s: SessionInfo, p: ContentPublication): ContentPublicationView => ({ ...p, canEdit: canEdit(s, p), canDelete: canDelete(s, p) });

export const publicationService = {
  /** 기간 안의 업로드 기록 (팀 전체). from·to 는 ISO (캘린더 앞뒤 여유 포함) */
  async list(session: SessionInfo, range: { from?: string; to?: string } = {}): Promise<ContentPublicationView[]> {
    const from = range.from ? new Date(range.from).getTime() : -Infinity;
    const to = range.to ? new Date(range.to).getTime() : Infinity;
    const rows = await getRepositories().publications.list((p) => {
      const t = new Date(publicationDate(p)).getTime();
      return t >= from && t < to;
    });
    return rows.sort((a, b) => publicationDate(a).localeCompare(publicationDate(b))).map((p) => view(session, p));
  },

  async create(session: SessionInfo, input: Partial<ContentPublicationInput>): Promise<ContentPublicationView> {
    const data = await normalize(session, input);
    const assignee = await assigneeFor(session, input.assigneeId);
    const now = nowIso();
    const row: ContentPublication = { id: createId("pub"), userId: session.user.id, ...data, assigneeId: assignee.id, assigneeName: assignee.name, createdAt: now, updatedAt: now };
    await getRepositories().publications.insert(row);
    await auditService.log(session, {
      action: "publication.create",
      targetType: "publication",
      targetId: row.id,
      targetLabel: row.title,
      detail: { platform: platformLabel(row.platform), status: row.status },
    });
    return view(session, row);
  },

  async update(session: SessionInfo, id: string, input: Partial<ContentPublicationInput>): Promise<ContentPublicationView> {
    const repo = getRepositories();
    const current = await repo.publications.get(id);
    if (!current) notFound("업로드 기록");
    if (!canEdit(session, current)) throw new AppError("FORBIDDEN", "등록한 사람·담당자·관리자만 수정할 수 있습니다.", 403);
    const data = await normalize(session, input, current);
    const assignee = await assigneeFor(session, input.assigneeId ?? current.assigneeId, current);
    const updated = await repo.publications.update(id, { ...data, assigneeId: assignee.id, assigneeName: assignee.name, updatedAt: nowIso() });
    if (!updated) notFound("업로드 기록");
    await auditService.log(session, {
      action: "publication.update",
      targetType: "publication",
      targetId: id,
      targetLabel: updated.title,
      detail: { platform: platformLabel(updated.platform), status: updated.status },
    });
    return view(session, updated);
  },

  async remove(session: SessionInfo, id: string): Promise<void> {
    const repo = getRepositories();
    const current = await repo.publications.get(id);
    if (!current) notFound("업로드 기록");
    if (!canDelete(session, current)) throw new AppError("FORBIDDEN", "등록한 사람·관리자만 삭제할 수 있습니다.", 403);
    await repo.publications.remove(id);
    await auditService.log(session, { action: "publication.delete", targetType: "publication", targetId: id, targetLabel: current.title });
  },

  /** 생성 콘텐츠별 업로드 상태: 업로드 완료 > 예약 > 미업로드 */
  async statusFor(contentIds: string[]): Promise<Record<string, ContentUploadState>> {
    const want = new Set(contentIds.slice(0, 500));
    const rows = await getRepositories().publications.list((p) => Boolean(p.contentId && want.has(p.contentId)));
    const out: Record<string, ContentUploadState> = {};
    for (const p of rows) {
      const id = p.contentId!;
      if (p.status === "published") out[id] = "published";
      else if (p.status === "scheduled" && out[id] !== "published") out[id] = "scheduled";
    }
    return out;
  },

  /** 담당자로 고를 수 있는 사람: 관리자 = 승인된 직원 전체, 직원 = 본인 */
  async assignees(session: SessionInfo): Promise<{ id: string; name: string }[]> {
    if (!isAdmin(session)) return [{ id: session.user.id, name: session.user.name }];
    const users = await getRepositories().profiles.list((u) => u.status === "active");
    // 본인을 맨 앞에 (등록 창의 기본 담당자)
    const others = users
      .filter((u) => u.id !== session.user.id)
      .map((u) => ({ id: u.id, name: u.name || u.email }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
    return [{ id: session.user.id, name: session.user.name }, ...others];
  },
};
