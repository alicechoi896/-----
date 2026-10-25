import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * 완성 영상 보관 (v0.9.51) — Supabase Storage 비공개 버킷 'videos' ({user_id}/{job_id}.mp4).
 * 1회 다운로드: 받은 뒤 1시간이 지나면 지우고, 받지 않아도 7일 뒤 지운다 (videoJobService.cleanup).
 * 데모(Supabase 미연결)는 서버 메모리에 둔다 (서버를 다시 켜면 사라짐).
 */
const g = globalThis as unknown as { __videoFiles?: Map<string, Buffer> };
const mem = () => (g.__videoFiles ??= new Map());
const inMemory = () => !isSupabaseConfigured();

export const videoStorage = {
  async put(key: string, file: Buffer, contentType = "video/mp4"): Promise<void> {
    if (inMemory()) {
      mem().set(key, file);
      return;
    }
    const db = await createSupabaseServerClient();
    const { error } = await db.storage.from("videos").upload(key, file, { contentType, upsert: true });
    if (error) throw new Error(`영상을 저장하지 못했습니다 (${error.message}). Supabase 에서 schema.sql 을 다시 실행했는지 확인해 주세요.`);
  },
  /** 다운로드·미리보기 주소 (10분) */
  async url(key: string, opts?: { seconds?: number; download?: string }): Promise<string | null> {
    if (inMemory()) return mem().has(key) ? `/api/video-jobs/file?key=${encodeURIComponent(key)}${opts?.download ? `&download=${encodeURIComponent(opts.download)}` : ""}` : null;
    const db = await createSupabaseServerClient();
    const { data, error } = await db.storage.from("videos").createSignedUrl(key, opts?.seconds ?? 600, opts?.download ? { download: opts.download } : undefined);
    return error ? null : data.signedUrl;
  },
  /** 브라우저가 직접 올릴 주소 (v0.9.70 무음 구간 자르기). 데모는 우리 API 로 */
  async signedUpload(key: string): Promise<{ url: string; method: "PUT" | "POST" }> {
    if (inMemory()) return { url: `/api/tools/silence-cut/upload?key=${encodeURIComponent(key)}`, method: "POST" };
    const db = await createSupabaseServerClient();
    const { data, error } = await db.storage.from("videos").createSignedUploadUrl(key, { upsert: true });
    if (error || !data) throw new Error(`올릴 주소를 만들지 못했습니다 (${error?.message ?? "알 수 없음"}). Supabase 에서 schema.sql 을 다시 실행했는지 확인해 주세요.`);
    return { url: data.signedUrl, method: "PUT" };
  },
  async download(key: string): Promise<Buffer | null> {
    if (inMemory()) return mem().get(key) ?? null;
    const db = await createSupabaseServerClient();
    const { data, error } = await db.storage.from("videos").download(key);
    return error || !data ? null : Buffer.from(await data.arrayBuffer());
  },
  /** 폴더 안 파일 (이름·만든 시각) */
  async list(folder: string): Promise<{ key: string; createdAt: string | null }[]> {
    if (inMemory()) return [...mem().keys()].filter((k) => k.startsWith(`${folder}/`)).map((key) => ({ key, createdAt: null }));
    const db = await createSupabaseServerClient();
    const { data } = await db.storage.from("videos").list(folder, { limit: 100 });
    return (data ?? []).map((f) => ({ key: `${folder}/${f.name}`, createdAt: f.created_at ?? null }));
  },
  memoryFile(key: string): Buffer | null {
    return inMemory() ? (mem().get(key) ?? null) : null;
  },
  async remove(key: string): Promise<void> {
    if (inMemory()) {
      mem().delete(key);
      return;
    }
    const db = await createSupabaseServerClient();
    await db.storage.from("videos").remove([key]);
  },
};
