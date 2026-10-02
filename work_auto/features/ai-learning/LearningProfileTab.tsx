"use client";

import { useState } from "react";
import { Eye, GraduationCap, RefreshCw, Undo2 } from "lucide-react";
import type { LearningProfileView } from "@/lib/types";
import { LEARNING_CATEGORIES } from "@/lib/types";
import { LEARNING_CATEGORY_LABEL, learningConfig } from "@/lib/learning-config";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import { Badge, Button, Drawer, EmptyState, ErrorState, LoadingState, Notice, cardClass } from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";

/**
 * 학습 프로필 (팀 공통, 채널·유형별 6개). docs/INCREMENTAL_LEARNING.md
 * 생성 결과의 👍/👎·직접 수정·선택한 제목·★·업로드 완료가 쌓이면 AI 가 작은 "경향" 목록으로 압축한다.
 * 다음 생성에 참고(강제 아님)하며, 규칙·금지 표현·나의 스타일이 항상 우선한다.
 */
export function LearningProfileTab({ isAdmin }: { isAdmin: boolean }) {
  const { data, loading, error, reload, setData } = useAsync(() => api.learning.list(), []);
  const [running, setRunning] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "info" | "warning"; text: string } | null>(null);
  const [viewing, setViewing] = useState<LearningProfileView | null>(null);

  async function update(p: LearningProfileView) {
    setRunning(p.id);
    setMessage(null);
    try {
      const next = await api.learning.update(p.id);
      setData((prev) => prev?.map((x) => (x.id === p.id ? { ...x, ...next, myPending: 0 } : x)) ?? null);
      setMessage({ tone: "info", text: `${p.label} 학습 프로필을 v${next.version} 으로 업데이트했습니다.` });
    } catch (e) {
      setMessage({ tone: "warning", text: e instanceof Error ? e.message : "학습하지 못했습니다." });
    } finally {
      setRunning(null);
    }
  }

  async function rollback(p: LearningProfileView) {
    if (!window.confirm(`${p.label} 학습 프로필을 직전 버전으로 되돌릴까요?`)) return;
    try {
      await api.learning.rollback(p.id);
      reload();
    } catch (e) {
      setMessage({ tone: "warning", text: e instanceof Error ? e.message : "되돌리지 못했습니다." });
    }
  }

  if (loading) return <LoadingState variant="skeleton" rows={3} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-relaxed text-fg-subtle">
        팀 공통 학습 프로필입니다. 결과에 <b className="font-medium text-fg-muted">👍/👎, 직접 수정, 쓴 제목 체크, ★, 업로드 완료</b>를 남기면 쌓이고,
        새 데이터가 {learningConfig.updateThreshold}개 모이면 AI 가 자동으로 작은 &ldquo;경향&rdquo; 목록으로 정리합니다. 다음 생성에 참고하지만 규칙·금지 표현·나의 스타일이 항상 우선합니다.
        AI 를 다시 훈련(Fine-tuning)하는 방식이 아니라 요약을 함께 보내는 방식입니다.
      </p>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(data ?? []).map((p) => {
          const count = LEARNING_CATEGORIES.reduce((n, c) => n + (p.summaryJson[c]?.length ?? 0), 0);
          const pct = Math.min(100, Math.round((p.myPending / p.threshold) * 100));
          return (
            <article key={p.id} className={cn(cardClass, "flex flex-col p-5")}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="flex items-center gap-1.5 font-semibold text-fg">
                  <GraduationCap className="size-4 text-fg-subtle" />
                  {p.label}
                </h3>
                <Badge tone={p.version ? "brand" : "neutral"}>{p.version ? `v${p.version}` : "학습 전"}</Badge>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                {[
                  ["학습 데이터", p.sampleCount],
                  ["긍정", p.positiveCount],
                  ["부정", p.negativeCount],
                ].map(([label, v]) => (
                  <div key={label} className="rounded-control bg-subtle px-2 py-2">
                    <dt className="text-[11px] text-fg-subtle">{label}</dt>
                    <dd className="tabular text-base font-semibold text-fg">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-fg-subtle">
                {p.lastProcessedAt ? `마지막 학습 ${formatDate(p.lastProcessedAt)} · ${p.updatedByName}` : "아직 학습하지 않았습니다"} · 경향 {count}개
              </p>
              <div className="mt-3">
                <div className="flex justify-between text-xs text-fg-muted">
                  <span>내 새 학습 데이터</span>
                  <span className="tabular">
                    {p.myPending} / {p.threshold}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-brand transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
              {p.lastError && <p className="mt-2 text-xs text-danger">최근 학습 오류: {p.lastError}</p>}
              <div className="flex-1" />
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="primary" icon={RefreshCw} loading={running === p.id} disabled={!p.myPending || Boolean(running)} onClick={() => void update(p)}>
                  지금 학습 업데이트
                </Button>
                <Button size="sm" icon={Eye} disabled={!count} onClick={() => setViewing(p)}>
                  학습 내용 보기
                </Button>
                {isAdmin && p.previousSummaryJson && (
                  <Button size="sm" variant="ghost" icon={Undo2} onClick={() => void rollback(p)}>
                    이전 버전으로
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <Drawer open={Boolean(viewing)} onClose={() => setViewing(null)} title={viewing ? `${viewing.label} · v${viewing.version}` : ""}>
        {viewing &&
          (LEARNING_CATEGORIES.every((c) => !viewing.summaryJson[c]?.length) ? (
            <EmptyState compact title="아직 학습한 경향이 없습니다" />
          ) : (
            <div className="space-y-5">
              <p className="text-xs leading-relaxed text-fg-subtle">
                신뢰도는 여러 콘텐츠에서 반복될수록 높아집니다. 근거가 {learningConfig.minSupportForPrompt}개 미만이거나 신뢰도가 낮은 경향은 생성에 쓰지 않습니다 (흐리게 표시).
              </p>
              {LEARNING_CATEGORIES.filter((c) => viewing.summaryJson[c]?.length).map((c) => (
                <section key={c}>
                  <h4 className="mb-1.5 text-[13px] font-semibold text-fg">{LEARNING_CATEGORY_LABEL[c]}</h4>
                  <ul className="space-y-1.5">
                    {viewing.summaryJson[c]!.map((i) => {
                      const used = i.support_count >= learningConfig.minSupportForPrompt && i.confidence >= learningConfig.minConfidenceForPrompt;
                      return (
                        <li key={i.text} className={cn("rounded-control border border-line px-3 py-2", !used && "opacity-50")}>
                          <p className="text-sm text-fg">{i.text}</p>
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-fg-subtle">
                            <div className="h-1 w-16 overflow-hidden rounded-full bg-muted">
                              <div className="h-full bg-brand" style={{ width: `${Math.round(i.confidence * 100)}%` }} />
                            </div>
                            신뢰도 {Math.round(i.confidence * 100)}% · 근거 {i.support_count} (긍정 {i.positive_count} · 부정 {i.negative_count})
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          ))}
      </Drawer>
    </div>
  );
}
