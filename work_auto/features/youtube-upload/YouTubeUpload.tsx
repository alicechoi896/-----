"use client";

import { useEffect, useState } from "react";
import { Upload } from "lucide-react";
import { Button, Notice, SectionCard } from "@/components/ui";

/** v0.9.150 유튜브 자동 업로드 — 연결 카드(API 연결 센터)와 업로드 버튼(완성 영상·자동 제작 결과) */
interface Status {
  configured: boolean;
  connected: boolean;
  channelTitle: string | null;
  connectedAt: string | null;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" }, cache: "no-store" });
  const j = (await res.json().catch(() => null)) as { ok: boolean; data: T; error?: { message: string } } | null;
  if (!j?.ok) throw new Error(j?.error?.message ?? "요청하지 못했습니다.");
  return j.data;
}

export function YouTubeConnectCard() {
  const [s, setS] = useState<Status | null>(null);
  // 구글 연결 뒤 돌아온 안내 (?youtube=…)
  const [note] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("youtube")));
  useEffect(() => {
    void call<Status>("/api/youtube/upload").then(setS).catch(() => setS(null));
  }, []);
  if (!s) return null;
  return (
    <SectionCard title="유튜브 업로드 연결" icon={Upload} description="구글 계정으로 내 유튜브 채널에 업로드 권한을 줍니다. 연결하면 완성 영상·자동 제작 결과에서 [유튜브에 올리기]로 바로 올리거나 예약할 수 있습니다." data-yt-connect>
      {note && <Notice tone="info" className="mb-2">{note}</Notice>}
      {!s.configured ? (
        <Notice tone="warning">
          준비가 필요합니다: Google Cloud 에서 YouTube Data API v3 를 켜고 OAuth 클라이언트(웹)를 만든 뒤, Vercel 환경변수 GOOGLE_OAUTH_CLIENT_ID · GOOGLE_OAUTH_CLIENT_SECRET 을 넣어 주세요. 승인된 리디렉션 URI: https://work-auto-blush.vercel.app/api/youtube/oauth/callback
        </Notice>
      ) : s.connected ? (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span>
            연결됨: <b>{s.channelTitle ?? "유튜브 채널"}</b> ({s.connectedAt ? new Date(s.connectedAt).toLocaleDateString("ko-KR") : ""})
          </span>
          <Button size="sm" variant="ghost" onClick={() => void call("/api/youtube/upload", { method: "DELETE" }).then(() => setS({ ...s, connected: false }))}>
            연결 끊기
          </Button>
          <a href="/api/youtube/oauth/start" className="text-[12px] text-brand hover:underline">
            다른 채널로 다시 연결
          </a>
        </div>
      ) : (
        <a href="/api/youtube/oauth/start" className="inline-flex h-9 items-center gap-1.5 rounded-control bg-brand px-4 text-[13.5px] font-semibold text-white hover:bg-brand-hover" data-yt-connect-start>
          <Upload className="size-4" /> 구글 계정으로 유튜브 연결
        </a>
      )}
      <p className="mt-2 text-[11.5px] text-fg-subtle">구글 검수(감사)를 받지 않은 API 프로젝트로 올린 영상은 유튜브가 &lsquo;비공개&rsquo;로 고정합니다. 공개·예약 공개를 쓰려면 Google 의 YouTube API 감사를 받아야 합니다. 열쇠는 암호화해 서버에만 보관합니다.</p>
    </SectionCard>
  );
}

/** 완성 영상 → 유튜브 업로드 (확인 창, 1번 = 1번) */
export function YouTubeUploadButton({ jobId, title, description, tags, productId, defaultAt }: { jobId: string; title: string; description?: string; tags?: string[]; productId?: string | null; defaultAt?: string }) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(defaultAt ?? "");
  const [privacy, setPrivacy] = useState<"private" | "unlisted" | "public">("private");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function upload() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await call<{ url: string }>("/api/youtube/upload", { method: "POST", body: JSON.stringify({ jobId, title, description, tags, productId, privacy, publishAt: at ? new Date(at).toISOString() : null, confirmed: true }) });
      setMsg({ ok: true, text: `올렸습니다: ${r.url} (업로드 관리에도 기록)` });
      setOpen(false);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "올리지 못했습니다." });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-1" data-yt-upload>
      {!open ? (
        <Button size="sm" variant="secondary" icon={Upload} onClick={() => setOpen(true)}>
          유튜브에 올리기
        </Button>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5 rounded-control border border-line p-2 text-[12px]">
          <label className="flex items-center gap-1">
            예약 공개
            <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className="h-7 rounded border border-line bg-canvas px-1" aria-label="예약 공개 시각" />
          </label>
          {!at && (
            <select value={privacy} onChange={(e) => setPrivacy(e.target.value as typeof privacy)} className="h-7 rounded border border-line bg-canvas px-1" aria-label="공개 범위">
              <option value="private">비공개</option>
              <option value="unlisted">일부 공개</option>
              <option value="public">공개</option>
            </select>
          )}
          <Button size="sm" variant="primary" loading={busy} onClick={() => window.confirm(at ? `유튜브에 올리고 ${new Date(at).toLocaleString("ko-KR")}에 공개되게 예약할까요?` : "유튜브에 지금 올릴까요?") && void upload()} data-yt-upload-go>
            올리기
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            취소
          </Button>
        </div>
      )}
      {msg && <p className={msg.ok ? "text-[11.5px] text-success" : "text-[11.5px] text-danger"}>{msg.text}</p>}
    </div>
  );
}
