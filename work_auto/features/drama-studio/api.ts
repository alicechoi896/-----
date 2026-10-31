import type { ImageModel, VideoModel, VideoOptions } from "@/lib/drama-studio/models";
import type { DramaIdea, DramaProject, DramaProjectSummary, DramaSettings, EditableSection, SheetKind, StepKey } from "@/lib/drama-studio/types";

/** 드라마 스튜디오 화면 → 서버 (캐시 없이 항상 새로). 응답: { ok, data } | { ok:false, error:{code,message} } */
export class StudioError extends Error {
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
    throw new StudioError("NETWORK", "서버에 연결할 수 없습니다. 네트워크를 확인해 주세요.");
  }
  const body = (await res.json().catch(() => null)) as { ok: true; data: T } | { ok: false; error: { code: string; message: string } } | null;
  if (!body) throw new StudioError("BAD_RESPONSE", `서버 응답을 읽지 못했습니다 (HTTP ${res.status}).`);
  if (!body.ok) throw new StudioError(body.error.code, body.error.message);
  return body.data;
}
const post = <T>(url: string, body: unknown = {}) => call<T>(url, { method: "POST", body: JSON.stringify(body) });

export interface Loaded {
  project: DramaProject;
  urls: Record<string, string>;
}
export const newRequestId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `rq-${Date.now()}-${Math.random().toString(36).slice(2)}`);

export const studioApi = {
  home: () => call<{ projects: DramaProjectSummary[]; videoModels: VideoModel[]; imageModels: ImageModel[]; sfx?: string[] }>("/api/drama-studio"),
  create: (body: { title: string; settings: Partial<DramaSettings>; startStep: StepKey }) => post<Loaded>("/api/drama-studio", body),
  get: (id: string) => call<Loaded>(`/api/drama-studio/${id}`),
  patch: (id: string, section: EditableSection, value: unknown, keepalive = false) => call<Loaded>(`/api/drama-studio/${id}`, { method: "PATCH", body: JSON.stringify({ section, value }), keepalive }),
  approve: (id: string, step: StepKey) => post<Loaded>(`/api/drama-studio/${id}/approve`, { step }),
  generate: (id: string, action: string, extra: Record<string, unknown> = {}) => post<Loaded & { aiCalls: number; improved?: DramaIdea }>(`/api/drama-studio/${id}/generate`, { action, clientRequestId: newRequestId(), ...extra }),
  images: (id: string, body: { jobs: { target: { type: "sheet"; charId: string; sheetKind: SheetKind } | { type: "frame"; sceneId: string } | { type: "shot"; shotId: string }; prompt?: string }[]; modelId: string; clientRequestId: string }) => post<Loaded & { created: number; failed: number }>(`/api/drama-studio/${id}/images`, { ...body, confirmed: true }),
  music: (id: string, body: { note: string; clientRequestId: string }) => post<Loaded & { created: number; failed: number }>(`/api/drama-studio/${id}/music`, { ...body, confirmed: true }),
  videos: (id: string, body: { jobs?: { shotId?: string; sceneIds: string[]; options: VideoOptions; prompt?: string }[]; retryTaskIds?: string[]; clientRequestId: string; chain?: boolean }) => post<Loaded & { created: number; failed: number }>(`/api/drama-studio/${id}/videos`, { ...body, confirmed: true }),
  sync: (id: string) => post<Loaded & { changed: boolean }>(`/api/drama-studio/${id}/sync`),
  render: (id: string) => post<Loaded>(`/api/drama-studio/${id}/render`),
  /** 파일 올리기: 서명 주소로 Storage 에 바로 → 단계에 잇기 */
  async upload(id: string, file: File, kind: "image" | "video" | "audio", target: Record<string, unknown>): Promise<Loaded> {
    const up = await post<{ key: string; url: string; method: "PUT" | "POST"; contentType: string }>(`/api/drama-studio/${id}/upload-url`, { kind, fileName: file.name, size: file.size });
    let res: Response;
    try {
      res = await fetch(up.url, { method: up.method, body: file, headers: { "Content-Type": up.contentType } });
    } catch {
      throw new StudioError("NETWORK", "파일을 올리지 못했습니다. 네트워크를 확인해 주세요.");
    }
    if (!res.ok) throw new StudioError("UPLOAD", `파일을 올리지 못했습니다 (HTTP ${res.status}).`);
    return post<Loaded>(`/api/drama-studio/${id}/register`, { key: up.key, kind, fileName: file.name, target });
  },
};
