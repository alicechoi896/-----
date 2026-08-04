"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { DemoBadge } from "@/components/demo/demo-badge";
import { useDemoBrainStore } from "@/lib/demo/store";
import type { BrainHistoryEntry } from "@/lib/demo/rule-update-data";
import { GitCommitHorizontal, X } from "lucide-react";

export function BrainHistoryClient() {
  const { history } = useDemoBrainStore();
  const [selected, setSelected] = useState<BrainHistoryEntry | null>(null);
  const ordered = [...history].reverse();

  return (
    <div className="p-6 max-w-[1440px] mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-violet-600 uppercase">성과 학습센터</p>
          <h1 className="mt-1 text-2xl font-semibold text-neutral-900">AI 브레인 변경 이력</h1>
          <p className="mt-1 text-sm text-neutral-500">버전별로 AI 브레인에 반영된 변경 내역을 확인합니다.</p>
        </div>
        <DemoBadge variant="prototype" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-6">
        {/* 타임라인 */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <div className="relative pl-6">
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-neutral-200" />
            <div className="space-y-5">
              {ordered.map((entry, i) => (
                <button
                  key={entry.version}
                  onClick={() => setSelected(entry)}
                  className={`relative block w-full text-left rounded-xl border p-4 transition-colors ${
                    selected?.version === entry.version
                      ? "border-violet-400 bg-violet-50/50"
                      : "border-neutral-200 bg-white hover:border-violet-200"
                  }`}
                >
                  <span
                    className={`absolute -left-6 top-5 size-3.5 rounded-full border-2 border-white ${
                      i === 0 ? "bg-violet-600" : "bg-neutral-300"
                    }`}
                  />
                  <div className="flex items-center gap-2">
                    <GitCommitHorizontal className="size-4 text-violet-600" />
                    <p className="font-semibold text-neutral-900">{entry.version}</p>
                    {i === 0 && (
                      <Badge className="bg-violet-100 text-violet-700" variant="secondary">
                        최신
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-neutral-600">{entry.title}</p>
                  <ul className="mt-1.5 text-xs text-neutral-500 space-y-0.5 list-disc list-inside">
                    {entry.changes.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 상세 */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 lg:sticky lg:top-6 h-fit">
          {!selected ? (
            <div className="text-center text-neutral-400 text-sm py-12">
              왼쪽 타임라인에서 버전을 선택하면 상세 내역이 표시됩니다.
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between">
                <p className="font-semibold text-lg text-neutral-900">{selected.version} 상세</p>
                <button onClick={() => setSelected(null)} className="text-neutral-400 hover:text-neutral-700">
                  <X className="size-4" />
                </button>
              </div>

              <div className="mt-4 space-y-4 text-sm">
                <div>
                  <p className="font-medium text-neutral-800 mb-1">반영 데이터</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.reflectedData.map((d) => (
                      <Badge key={d} variant="outline">
                        {d}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="font-medium text-neutral-800 mb-1">변경된 규칙</p>
                  <ul className="list-disc list-inside text-neutral-600 space-y-0.5">
                    {selected.changes.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>

                {selected.weightChanges && (
                  <div>
                    <p className="font-medium text-neutral-800 mb-1.5">변경 전후 가중치</p>
                    <div className="space-y-1.5">
                      {selected.weightChanges.map((w) => (
                        <div key={w.element} className="flex items-center justify-between text-xs">
                          <span className="text-neutral-600">{w.element}</span>
                          <span className="font-medium text-neutral-900">
                            {w.before.toFixed(2)} → {w.after.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p>
                  <span className="font-medium text-neutral-800">변경 이유:</span>{" "}
                  <span className="text-neutral-600">{selected.reason}</span>
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-neutral-400">승인자</p>
                    <p className="text-neutral-800">{selected.approver}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-400">반영 시각</p>
                    <p className="text-neutral-800">{new Date(selected.reflectedAt).toLocaleString("ko-KR")}</p>
                  </div>
                </div>
                <div className="rounded-lg bg-violet-50 p-3">
                  <p className="text-xs font-medium text-violet-700 mb-0.5">생성 결과 비교</p>
                  <p className="text-neutral-700">{selected.contentComparison}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
