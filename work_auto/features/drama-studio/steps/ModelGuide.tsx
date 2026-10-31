"use client";

import { useState } from "react";
import { Film } from "lucide-react";
import { VIDEO_MODELS, lengthLabel } from "@/lib/drama-studio/models";
import type { GenMode } from "@/lib/drama-studio/types";

const MODE_SHORT: Record<GenMode, string> = { first_frame: "시작 프레임", first_last: "시작+끝", reference: "참고 이미지", multi_shot: "멀티 샷", text: "글만" };

/** v0.9.108 영상 모델 한눈에 보기: 한 번에 만들 수 있는 길이·해상도·방식·소리·가격 (docs.kie.ai · kie.ai 2026-11-01 확인) */
export function ModelGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-card border border-line bg-canvas" data-model-guide>
      <button type="button" onClick={() => setOpen((x) => !x)} className="flex w-full items-center gap-2 px-4 py-3 text-left text-[14px] font-semibold">
        <Film className="size-4 text-fg-subtle" />
        영상 모델 {VIDEO_MODELS.length}개 한눈에 보기 (최대 길이·방식·가격)
        <span className="ml-auto text-[12px] font-normal text-fg-subtle">{open ? "접기 ▲" : "펼치기 ▼"}</span>
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-line px-4 pb-3">
          <table className="mt-2 w-full min-w-[760px] text-[12.5px]">
            <thead className="text-left text-fg-muted">
              <tr>
                <th className="py-1.5 pr-3 font-medium">모델</th>
                <th className="py-1.5 pr-3 font-medium">한 번에 길이</th>
                <th className="py-1.5 pr-3 font-medium">해상도</th>
                <th className="py-1.5 pr-3 font-medium">방식</th>
                <th className="py-1.5 pr-3 font-medium">소리</th>
                <th className="py-1.5 font-medium">가격 (크레딧, 1 = $0.005)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {VIDEO_MODELS.map((m) => (
                <tr key={m.id}>
                  <td className="py-1.5 pr-3 font-medium text-fg">{m.label}</td>
                  <td className="py-1.5 pr-3 tabular font-semibold">{lengthLabel(m)}{m.multiShot ? ` (멀티 샷 최대 ${m.multiShot.maxShots}컷)` : ""}</td>
                  <td className="py-1.5 pr-3">{m.resolutions.join(" / ")}</td>
                  <td className="py-1.5 pr-3">{m.modes.map((x) => MODE_SHORT[x]).join(" · ")}</td>
                  <td className="py-1.5 pr-3">{m.audio === "always" ? "항상" : m.audio === "toggle" ? "켜고 끄기" : "없음"}</td>
                  <td className="py-1.5 text-fg-muted">{m.priceNote}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11.5px] text-fg-subtle">긴 장면은 여러 샷·장면으로 나눠 만든 뒤 타임라인에서 이어 붙입니다. 시작 프레임·시작+끝·참고 이미지는 한 요청에 섞지 않습니다. 같은 샷을 모델만 바꿔 만들면 비교할 수 있습니다.</p>
        </div>
      )}
    </div>
  );
}
