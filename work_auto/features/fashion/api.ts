import type { FashionProject, FashionProjectSummary, FashionSection } from "@/lib/fashion/types";

/** AI 패션 화면 → 서버 (캐시 없이). 응답: { ok, data } | { ok:false, error } */
export class FashionError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers }, cache: "no-store" });
  } catch {
    throw new FashionError("NETWORK", "서버에 연결할 수 없습니다. 네트워크를 확인해 주세요.");
  }
  const body = (await res.json().catch(() => null)) as { ok: true; data: T } | { ok: false; error: { code: string; message: string } } | null;
  if (!body) throw new FashionError("BAD_RESPONSE", `서버 응답을 읽지 못했습니다 (HTTP ${res.status}).`);
  if (!body.ok) throw new FashionError(body.error.code, body.error.message);
  return body.data;
}
const post = <T>(url: string, body: unknown = {}) => call<T>(url, { method: "POST", body: JSON.stringify(body) });

export interface FashionLoaded {
  project: FashionProject;
  urls: Record<string, string>;
}
export const newRequestId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `rq-${Date.now()}-${Math.random().toString(36).slice(2)}`);

export type ImageJob = { target: { type: "model" } | { type: "look"; lookId: string } };

export const fashionApi = {
  home: () => call<{ projects: FashionProjectSummary[]; imageCredits: number }>("/api/fashion"),
  create: (body: { title: string; theme: string }) => post<FashionLoaded>("/api/fashion", body),
  get: (id: string) => call<FashionLoaded>(`/api/fashion/${id}`),
  remove: (id: string) => call<{ ok: boolean }>(`/api/fashion/${id}`, { method: "DELETE" }),
  patch: (id: string, section: FashionSection, value: unknown, keepalive = false) => call<FashionLoaded>(`/api/fashion/${id}`, { method: "PATCH", body: JSON.stringify({ section, value }), keepalive }),
  action: (id: string, action: string, extra: Record<string, unknown> = {}) => post<FashionLoaded & { aiCalls: number }>(`/api/fashion/${id}/action`, { action, clientRequestId: newRequestId(), ...extra }),
  images: (id: string, body: { jobs: ImageJob[]; clientRequestId: string }) => post<FashionLoaded & { created: number; failed: number }>(`/api/fashion/${id}/images`, { ...body, confirmed: true }),
  music: (id: string, body: { note: string; clientRequestId: string }) => post<FashionLoaded>(`/api/fashion/${id}/music`, { ...body, confirmed: true }),
  sync: (id: string) => post<FashionLoaded & { changed: boolean }>(`/api/fashion/${id}/sync`),
  render: (id: string, kind: "feed" | "reels") => post<FashionLoaded>(`/api/fashion/${id}/render`, { kind }),
  /** 파일 올리기: 서명 주소로 Storage 에 바로 → 잇기 */
  async upload(id: string, file: File, kind: "image" | "audio", target: Record<string, unknown>): Promise<FashionLoaded> {
    const up = await post<{ key: string; url: string; method: "PUT" | "POST"; contentType: string }>(`/api/fashion/${id}/upload-url`, { kind, fileName: file.name, size: file.size });
    let res: Response;
    try {
      res = await fetch(up.url, { method: up.method, body: file, headers: { "Content-Type": up.contentType } });
    } catch {
      throw new FashionError("NETWORK", "파일을 올리지 못했습니다. 네트워크를 확인해 주세요.");
    }
    if (!res.ok) throw new FashionError("UPLOAD", `파일을 올리지 못했습니다 (HTTP ${res.status}).`);
    return post<FashionLoaded>(`/api/fashion/${id}/register`, { key: up.key, kind, fileName: file.name, target });
  },
};
