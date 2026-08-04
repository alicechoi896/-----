"use client";

import Link from "next/link";
import type { Database } from "@/types/database";
import { LayoutGrid } from "lucide-react";

type ContentProject = Database["public"]["Tables"]["content_projects"]["Row"];

export function ProjectListClient({ projects }: { projects: ContentProject[] }) {
  return (
    <div className="p-6 max-w-[1440px] mx-auto space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-violet-600 uppercase">콘텐츠 오케스트레이터</p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-900">
          선택한 전략을 여러 플랫폼 콘텐츠로 동시에 변환합니다
        </h1>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center text-neutral-500">
          아직 콘텐츠 프로젝트가 없습니다. 전략 시뮬레이터에서 전략을 선택하면 이곳으로 이동합니다.
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
              <div className="flex items-center gap-2">
                <LayoutGrid className="size-4 text-violet-600" />
                <p className="font-medium text-neutral-900">{p.title}</p>
              </div>
              <p className="mt-1 text-sm text-neutral-500 line-clamp-2">{p.core_message}</p>
              <p className="mt-2 text-xs text-neutral-400">상태: {p.status}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
