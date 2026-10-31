"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import type { VideoChannel, VideoScene } from "@/lib/types/video-production";
import { api } from "@/lib/api-client";
import { Button, Input, Modal, Notice, SegmentedControl } from "@/components/ui";
import { cn } from "@/lib/utils";

type Gif = NonNullable<VideoScene["gif"]>;
type Item = Awaited<ReturnType<typeof api.videoProduction.giphy>>[number];

/** 자주 쓰는 검색어 (GIPHY 는 영어 검색이 결과가 훨씬 많다) */
const SUGGEST = ["wow", "omg", "yes", "love", "fire", "check", "sparkle", "shocked", "clap", "good"];

/**
 * v0.9.102 GIPHY GIF 고르기 — 검색 버튼 1번 = 검색 1회 (무료). 입력할 때마다 자동으로 부르지 않는다.
 * stickers = 배경이 투명해서 영상 위에 얹기 좋다.
 */
export function GiphyPicker({ open, onClose, onPick, channelId, sceneText }: { open: boolean; onClose: () => void; onPick: (g: Gif) => void; channelId: VideoChannel; sceneText: string }) {
  const [q, setQ] = useState("wow");
  const [type, setType] = useState<"stickers" | "gifs">("stickers");
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function search(query = q) {
    if (busy || !query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setItems(await api.videoProduction.giphy(query.trim(), type, channelId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "검색하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="주목 효과 GIF 고르기 (GIPHY)" description={sceneText ? `컷: ${sceneText}` : undefined} className="max-w-2xl">
      <div className="space-y-3" data-giphy-picker>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <SegmentedControl value={type} onChange={(v) => setType(v as "stickers" | "gifs")} options={[{ value: "stickers", label: "스티커 (배경 투명)" }, { value: "gifs", label: "GIF" }]} />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="검색어 (영어가 결과가 많아요: wow, omg…)" className="h-9 min-w-[180px] flex-1" aria-label="GIPHY 검색어" />
          <Button type="submit" variant="primary" icon={Search} loading={busy} disabled={busy || !q.trim()}>
            검색
          </Button>
        </form>
        <div className="flex flex-wrap gap-1">
          {SUGGEST.map((w) => (
            <button
              key={w}
              type="button"
              className="rounded-full px-2 py-0.5 text-[11.5px] text-fg-muted ring-1 ring-inset ring-line hover:bg-subtle"
              onClick={() => {
                setQ(w);
                void search(w);
              }}
            >
              {w}
            </button>
          ))}
        </div>
        {error && <Notice tone="warning">{error}</Notice>}
        {items && !items.length && <p className="text-[13px] text-fg-subtle">결과가 없습니다. 다른 검색어로 찾아보세요.</p>}
        {items && items.length > 0 && (
          <div className="grid max-h-[46vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4" data-giphy-results>
            {items.map((it) => (
              <button
                key={it.id}
                type="button"
                title={it.title}
                onClick={() => {
                  onPick({ id: it.id, url: it.url, preview: it.preview, title: it.title });
                  onClose();
                }}
                className={cn("flex aspect-square items-center justify-center overflow-hidden rounded-control border border-line hover:border-brand", type === "stickers" ? "bg-[repeating-conic-gradient(#e5e7eb_0_25%,#fff_0_50%)] bg-[length:16px_16px]" : "bg-subtle")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.preview} alt={it.title} loading="lazy" className="max-h-full max-w-full object-contain" />
              </button>
            ))}
          </div>
        )}
        <p className="text-[11px] text-fg-subtle">
          Powered by GIPHY · GIF 의 저작권은 원작자에게 있습니다. 수익을 내는 영상에는 저작권 신고를 받을 수 있으니 스티커·이모지 위주로 쓰세요. 검색 버튼 1번 = GIPHY 검색 1회 (무료, 같은 검색어는 10분 동안 다시 부르지 않음).
        </p>
      </div>
    </Modal>
  );
}
