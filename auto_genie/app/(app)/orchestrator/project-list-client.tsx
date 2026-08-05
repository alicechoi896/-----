"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { createStandaloneContentProjectAction, type StandaloneProjectState } from "./actions";
import type { Database } from "@/types/database";
import type { ScreenMode } from "@/lib/access/screen-mode";
import { LayoutGrid, Plus, Link2 } from "lucide-react";

type ContentProject = Database["public"]["Tables"]["content_projects"]["Row"];

const initialState: StandaloneProjectState = { error: null };

export function ProjectListClient({
  projects,
  screenMode,
}: {
  projects: ContentProject[];
  screenMode: ScreenMode;
}) {
  const [showForm, setShowForm] = useState(false);
  const [state, action, pending] = useActionState(createStandaloneContentProjectAction, initialState);

  return (
    <div className="p-6 max-w-[1440px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium tracking-wide text-violet-600 uppercase">
            {screenMode === "technical" ? "콘텐츠 오케스트레이터" : "콘텐츠 만들기"}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-neutral-900">
            전략에서 AI로 생성하거나, 직접 쓴 콘텐츠를 등록해 전략 적합도를 확인합니다
          </h1>
        </div>
        <Button variant="outline" onClick={() => setShowForm((v) => !v)}>
          <Plus className="size-4" /> {showForm ? "목록 보기" : "직접 콘텐츠 등록"}
        </Button>
      </div>

      {showForm && (
        <form action={action} className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-4 max-w-xl">
          <p className="font-medium text-neutral-900">새 콘텐츠 프로젝트</p>
          <p className="text-sm text-neutral-500">
            먼저 프로젝트를 만들고, 다음 화면에서 직접 쓴 콘텐츠를 등록하세요. 원하면 나중에 전략을 연결해 적합도
            분석을 받을 수 있습니다.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="title">프로젝트명</Label>
            <Input id="title" name="title" required placeholder="예: 여름 신규 클래스 홍보 콘텐츠" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="coreMessage">핵심 메시지 (선택)</Label>
            <Input id="coreMessage" name="coreMessage" placeholder="이 콘텐츠로 전달하고 싶은 한 문장" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="targetAudience">타깃 고객 (선택)</Label>
            <Input id="targetAudience" name="targetAudience" placeholder="예: 온라인 판매를 시작한 1인 사업자" />
          </div>
          {state.error && <p className="text-sm text-orange-600">{state.error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "생성 중..." : "프로젝트 만들고 콘텐츠 등록하기"}
          </Button>
        </form>
      )}

      {!showForm &&
        (projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center text-neutral-500">
            아직 콘텐츠 프로젝트가 없습니다. 전략 시뮬레이터에서 전략을 선택하면 이곳으로 이동하거나, 위
            &apos;직접 콘텐츠 등록&apos;으로 바로 시작할 수 있습니다.
            <div className="mt-3">
              <Link href="/strategy" className="text-violet-600 hover:underline">
                전략 시뮬레이터로 이동 →
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/orchestrator?projectId=${p.id}`}
                className="rounded-2xl border border-neutral-200 bg-white p-4 hover:border-violet-300 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <LayoutGrid className="size-4 text-violet-600 shrink-0" />
                    <p className="font-medium text-neutral-900 truncate">{p.title}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {p.strategy_option_id ? (
                      <>
                        <Link2 className="size-3" /> 전략 연결됨
                      </>
                    ) : (
                      "직접 등록"
                    )}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-neutral-500 line-clamp-2">{p.core_message}</p>
                <p className="mt-2 text-xs text-neutral-400">상태: {p.status}</p>
              </Link>
            ))}
          </div>
        ))}
    </div>
  );
}
