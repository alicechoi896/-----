"use client";

import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import { Notice } from "@/components/ui";

const isShort = (url: string) => /^https?:\/\/([a-z0-9-]+\.)*xhslink\.com\//i.test(url);

/**
 * 샤오홍슈 영상 영구 링크(xhslink) 현황 — 안내만 (외부 호출 없음).
 * v0.9.127: TikHub 로 영구 링크를 받는 기능은 뺐다 (TikHub 응답에 xhslink 가 없어 50번 모두 실패). 영구 링크는 샤오홍슈 앱 [공유]에서만 나온다.
 */
export function XhsPermanentLinks() {
  const list = useAsync(() => api.videos.list(), []);
  const xhs = (list.data ?? []).filter((v) => v.platform === "xiaohongshu");
  if (list.loading || !xhs.length) return null;
  const done = xhs.filter((v) => isShort(v.shareUrl || v.url));
  const todo = xhs.length - done.length;
  return (
    <Notice tone={todo ? "warning" : "info"}>
      <span data-xhs-permanent-all>
        샤오홍슈 영상 영구 링크 <b>{done.length}</b> / {xhs.length}개
        {todo ? ` · 만료되는 링크 ${todo}개 — 영구 링크(xhslink)는 샤오홍슈 앱의 [공유] → 링크 복사로만 나옵니다. 제품 상세 › 연결된 영상의 [공유 링크 직접 넣기]로 넣어 주세요.` : " · 모두 영구 링크"}
      </span>
    </Notice>
  );
}
