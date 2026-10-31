"use client";

import { useState } from "react";
import { HardDriveDownload } from "lucide-react";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import { Button, Notice } from "@/components/ui";

const isShort = (url: string) => /^https?:\/\/([a-z0-9-]+\.)*xhslink\.com\//i.test(url);

/**
 * 샤오홍슈 영상 쓸 수 있는지 현황 (v0.9.134):
 * - 원본 보관: 영상을 가져올 때 원본을 받아 계속 보관한다 (링크가 만료돼도 영상 제작·새벽 자동 제작에 씀, 30GB 넘으면 오래된 것부터 지움)
 * - 예전에 가져와 보관 안 된 영상은 [원본 받아 두기] (무료 — 샤오홍슈에서 직접, 링크가 이미 만료된 영상은 받지 못함)
 * TikHub 로 영구 링크 받기는 v0.9.127 에 뺐다 (응답에 xhslink 가 없음).
 */
export function XhsPermanentLinks() {
  const list = useAsync(() => api.videos.list(), []);
  const vault = useAsync(() => api.videos.vaultStatus(), []);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const xhs = (list.data ?? []).filter((v) => v.platform === "xiaohongshu");
  if (list.loading || !xhs.length) return null;
  const stored = new Set(vault.data?.stored ?? []);
  const usable = xhs.filter((v) => stored.has(v.id) || isShort(v.shareUrl || v.url));
  const todo = xhs.filter((v) => !stored.has(v.id)).sort((a, b) => Number(Boolean(b.productId)) - Number(Boolean(a.productId)));

  async function keepAll() {
    if (!window.confirm(`보관 안 된 샤오홍슈 영상 ${todo.length}개의 원본을 받아 둡니다 (무료, 1개 몇 초). 링크가 이미 만료된 영상은 받지 못합니다. 진행할까요?`)) return;
    setBusy(true);
    let ok = 0;
    let fail = 0;
    for (const [i, v] of todo.entries()) {
      setNote(`원본 받는 중 ${i + 1}/${todo.length}… (받음 ${ok} · 못 받음 ${fail})`);
      const r = await api.videos.keepSource(v.id).catch(() => ({ kept: false }));
      if (r.kept) ok++;
      else fail++;
    }
    setBusy(false);
    setNote(`${ok}개 원본을 보관했습니다${fail ? ` · ${fail}개는 링크가 만료돼 받지 못했습니다 (샤오홍슈 앱 [공유] 링크를 [공유 링크 직접 넣기]로 넣은 뒤 다시 눌러 주세요)` : ""}.`);
    vault.reload();
  }

  return (
    <Notice tone={todo.length ? "warning" : "info"}>
      <div className="flex flex-wrap items-center gap-2" data-xhs-permanent-all>
        <span>
          샤오홍슈 영상 <b>{usable.length}</b> / {xhs.length}개 쓸 수 있음 (원본 보관 {stored.size}개 · 영구 링크 {xhs.filter((v) => isShort(v.shareUrl || v.url)).length}개)
        </span>
        {todo.length > 0 && (
          <Button size="sm" variant="secondary" icon={HardDriveDownload} loading={busy} disabled={busy} onClick={() => void keepAll()} data-xhs-keep-all>
            보관 안 된 영상 원본 받아 두기 ({todo.length}개 · 무료)
          </Button>
        )}
      </div>
      <p className="mt-1 text-[12px]">새로 가져오는 영상은 원본을 자동으로 보관합니다 (30GB 넘으면 오래된 것부터 지움).{note ? ` ${note}` : ""}</p>
    </Notice>
  );
}
