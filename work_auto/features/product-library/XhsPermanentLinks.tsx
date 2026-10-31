"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import type { ReferenceVideo } from "@/lib/types";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import { Button, Notice } from "@/components/ui";

const isShort = (url: string) => /^https?:\/\/([a-z0-9-]+\.)*xhslink\.com\//i.test(url);

/**
 * v0.9.122: 모든 제품의 샤오홍슈 영상 영구 링크(xhslink)를 한 번에 — 제품마다 들어가지 않아도 된다.
 * 영상 1개 = TikHub 상세 1회(약 $0.01), 확인 창 후 하나씩 차례로, 하루 한도(50회)에 닿으면 멈춤 (남은 것은 다음 날 다시 누르면 이어서).
 * 제품에 연결된 영상을 먼저 (자동 제작에 쓰이는 영상).
 */
export function XhsPermanentLinks() {
  const list = useAsync(() => api.videos.list(), []);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const xhs = (list.data ?? []).filter((v) => v.platform === "xiaohongshu");
  const done = xhs.filter((v) => isShort(v.shareUrl || v.url));
  const todo = xhs.filter((v) => !isShort(v.shareUrl || v.url)).sort((a, b) => Number(Boolean(b.productId)) - Number(Boolean(a.productId)));

  async function run() {
    const usage = await api.videos.tikhubUsage().catch(() => null);
    const left = usage ? Math.max(0, usage.limit - usage.calls) : 50;
    const n = Math.min(todo.length, left);
    if (!n) {
      setNote("오늘 TikHub 한도를 다 썼습니다. 내일 다시 눌러 주세요.");
      return;
    }
    if (!window.confirm(`TikHub 로 영구 공유 링크를 찾습니다: ${n}개 × 약 $0.01 = 약 $${(n * 0.01).toFixed(2)}${todo.length > n ? ` (오늘 남은 한도 ${left}회 — 나머지 ${todo.length - n}개는 내일 다시 누르면 이어서)` : ""}. 진행할까요?`)) return;
    setBusy(true);
    let ok = 0;
    let miss = 0;
    let stop: string | null = null;
    let streak = 0;
    let lastOthers: string[] = [];
    const saved = new Map<string, string>();
    for (const [i, v] of todo.slice(0, n).entries()) {
      setNote(`TikHub 로 찾는 중 ${i + 1}/${n}… (받음 ${ok})`);
      try {
        const r = await api.videos.shareLinkViaTikhub(v.id);
        if (r.saved) {
          ok++;
          streak = 0;
          saved.set(v.id, r.saved);
        } else {
          miss++;
          streak++;
          lastOthers = r.others;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "실패";
        miss++;
        streak++;
        if (/한도|BUDGET|연결되어 있지/.test(msg)) {
          stop = msg;
          break;
        }
      }
      // v0.9.123: 비용 보호 — 첫 1개가 안 되거나 3번 연속 안 되면 바로 멈춘다 (전에는 50번을 끝까지 보냈다)
      if ((i === 0 && !ok) || streak >= 3) {
        stop = `${i + 1}번째에서 멈췄습니다 — TikHub 응답에 영구 링크(xhslink)가 없어 더 보내지 않았습니다.${lastOthers.length ? ` 받은 공유 관련 값: ${lastOthers.join(" / ")}` : ""}`;
        break;
      }
    }
    list.setData((prev) => prev?.map((x): ReferenceVideo => (saved.has(x.id) ? { ...x, shareUrl: saved.get(x.id)! } : x)) ?? null);
    setBusy(false);
    setNote(`${ok}개 영구 링크를 받았습니다${miss ? ` · ${miss}개는 응답에 링크가 없거나 실패` : ""}.${stop ? ` ${stop}` : ""}`);
  }

  if (list.loading || !xhs.length) return null;
  return (
    <Notice tone={todo.length ? "warning" : "info"} data-xhs-permanent-all>
      <div className="flex flex-wrap items-center gap-2">
        <span>
          샤오홍슈 영상 영구 링크 <b>{done.length}</b> / {xhs.length}개{todo.length ? ` · 만료되는 링크 ${todo.length}개 (제품 연결 ${todo.filter((v) => v.productId).length}개)` : " · 모두 영구 링크"}
        </span>
        {todo.length > 0 && (
          <Button size="sm" variant="secondary" icon={Link2} loading={busy} disabled={busy} onClick={() => void run()} data-xhs-permanent-run>
            모든 영상 영구 링크 받기 (TikHub 1개 ≈ $0.01, 하루 50개)
          </Button>
        )}
      </div>
      {note && <p className="mt-1 text-[12px]">{note}</p>}
    </Notice>
  );
}
