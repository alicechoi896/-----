import "server-only";
import type { ConnectionTestResult } from "@/lib/types";
import { nowIso } from "@/lib/utils";

/**
 * 업리카 (v0.9.195) — 인스타그램·틱톡·스레드 등 SNS 게시 API (https://uplika.com/en/docs, REST https://api.uplika.com/v1).
 * - 인증: API 키를 Bearer 로 (권한 accounts:read · posts:read · posts:write). 키는 서버에서만, 로그·화면·오류에 넣지 않는다.
 * - 채널 연결은 업리카 대시보드(Connections)에서 사람이 한다. 여기서는 연결된 계정 목록을 읽고 게시만 한다.
 * - 영상: presign → PUT(서명된 주소, 인증 없음) → complete → POST /v1/posts (202, 게시 중 → GET /v1/posts/{id} 로 확인).
 * - 게시는 1번 누르면 1번 (Idempotency-Key = 화면의 요청 번호 → 같은 요청을 두 번 보내도 한 번만 게시). 자동 재시도 없음.
 */
const API = "https://api.uplika.com/v1";
const TIMEOUT_MS = 30_000;

type Obj = Record<string, unknown>;

export interface UplikaAccount {
  id: string;
  platform: string;
  handle: string;
  displayName: string;
  status: string;
}
export interface UplikaTarget {
  platform: string;
  status: string;
  url: string | null;
  error: string | null;
}
export interface UplikaPost {
  id: string;
  status: string;
  targets: UplikaTarget[];
}

export class UplikaError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function parsePost(b: Obj): UplikaPost {
  const targets = (Array.isArray(b.targets) ? (b.targets as Obj[]) : []).map((t) => ({
    platform: str(t.platform),
    status: str(t.status),
    url: str(t.url) || null,
    error: str((t.error as Obj | undefined)?.message) || str(t.error) || null,
  }));
  return { id: str(b.id), status: str(b.status), targets };
}

export class UplikaProvider {
  constructor(private readonly apiKey: string) {}

  private async call<T>(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as Obj;
    if (!res.ok) {
      const e = (body.error ?? body) as Obj;
      const msg = str(e.message) || `HTTP ${res.status}`;
      throw new UplikaError(msg.slice(0, 200), res.status, str(e.code) || null);
    }
    return body as T;
  }

  async accounts(): Promise<{ accounts: UplikaAccount[]; connectUrl: string | null }> {
    const b = await this.call<Obj>("/accounts", { method: "GET" });
    const list = (Array.isArray(b.data) ? (b.data as Obj[]) : []).map((a) => ({ id: str(a.id), platform: str(a.platform), handle: str(a.handle), displayName: str(a.displayName), status: str(a.status) }));
    return { accounts: list.filter((a) => a.id), connectUrl: str((b.next as Obj | undefined)?.url) || null };
  }

  /** 영상 올리기: presign → PUT → complete. 업리카 media id */
  async uploadVideo(file: Buffer, fileName: string, opts: { aiGenerated?: boolean } = {}): Promise<string> {
    const p = await this.call<Obj>("/media/presign", { method: "POST", body: JSON.stringify({ fileName, contentType: "video/mp4", bytes: file.length, aiGenerated: opts.aiGenerated ?? false }) });
    const id = str(p.id);
    const uploadUrl = str(p.uploadUrl);
    if (!id || !/^https:\/\//.test(uploadUrl)) throw new UplikaError("업로드 주소를 받지 못했습니다.", 502, null);
    // 서명된 저장소 주소로 바로 (인증 헤더 없음)
    const put = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": str(p.contentType) || "video/mp4" }, body: new Uint8Array(file), signal: AbortSignal.timeout(180_000) });
    if (!put.ok) throw new UplikaError(`영상을 올리지 못했습니다 (HTTP ${put.status}).`, put.status, null);
    await this.call<Obj>(`/media/${encodeURIComponent(id)}/complete`, { method: "POST", body: "{}" });
    return id;
  }

  async publish(input: { content: string; accountIds: string[]; mediaIds: string[]; options?: Obj; scheduledAt?: string | null }, idempotencyKey: string): Promise<UplikaPost> {
    const b = await this.call<Obj>("/posts", {
      method: "POST",
      idempotencyKey,
      body: JSON.stringify({ content: input.content, accountIds: input.accountIds, mediaIds: input.mediaIds, ...(input.options ? { options: input.options } : {}), ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}) }),
    });
    return parsePost(b);
  }

  /** v0.9.200 스레드 이어 쓰기 글 (첫 글 + 답글 차례로). content 대신 threadItems */
  async publishThread(input: { items: string[]; accountIds: string[]; scheduledAt?: string | null }, idempotencyKey: string): Promise<UplikaPost> {
    const b = await this.call<Obj>("/posts", {
      method: "POST",
      idempotencyKey,
      body: JSON.stringify({ threadItems: input.items.map((content) => ({ content })), accountIds: input.accountIds, ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}) }),
    });
    return parsePost(b);
  }

  async post(id: string): Promise<UplikaPost> {
    return parsePost(await this.call<Obj>(`/posts/${encodeURIComponent(id)}`, { method: "GET" }));
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const { accounts } = await this.accounts();
      return { ok: true, message: accounts.length ? `연결된 계정 ${accounts.length}개 (${accounts.map((a) => `${a.platform} @${a.handle}`).slice(0, 4).join(", ")})` : "키는 맞지만 연결된 계정이 없습니다. 업리카 대시보드 › Connections 에서 계정을 연결해 주세요.", testedAt: nowIso(), mock: false };
    } catch (e) {
      return { ok: false, message: e instanceof UplikaError && e.status === 401 ? "API 키가 맞지 않습니다 (업리카 대시보드 › API Keys)." : e instanceof Error ? e.message : "연결을 확인하지 못했습니다.", testedAt: nowIso(), mock: false };
    }
  }
}
