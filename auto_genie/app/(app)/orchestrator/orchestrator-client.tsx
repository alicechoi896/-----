"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { generateContentAction, updateContentOutputAction, deleteContentOutputAction } from "./actions";
import type { Database } from "@/types/database";
import { Sparkles, Pencil, Copy, RefreshCw, TrendingUp, Trash2, History } from "lucide-react";

type ContentProject = Database["public"]["Tables"]["content_projects"]["Row"];
type ContentOutput = Database["public"]["Tables"]["content_outputs"]["Row"];

const PLATFORMS: { value: string; label: string }[] = [
  { value: "naver_blog", label: "네이버 블로그" },
  { value: "instagram", label: "인스타그램 캐러셀" },
  { value: "threads", label: "스레드" },
  { value: "youtube_shorts", label: "유튜브 쇼츠" },
  { value: "newsletter", label: "이메일 뉴스레터" },
  { value: "landing_page", label: "랜딩페이지" },
];

export function OrchestratorClient({
  project,
  outputs,
}: {
  project: ContentProject;
  outputs: ContentOutput[];
}) {
  const router = useRouter();
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(
    outputs.length > 0 ? [] : PLATFORMS.map((p) => p.value)
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="p-6 max-w-[1440px] mx-auto space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-violet-600 uppercase">콘텐츠 오케스트레이터</p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-900">{project.title}</h1>
        <p className="mt-1 text-sm text-neutral-500">{project.core_message}</p>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <p className="font-medium text-neutral-900 mb-3">플랫폼 선택 후 동시 생성</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {PLATFORMS.map((p) => (
            <label key={p.value} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selectedPlatforms.includes(p.value)}
                onCheckedChange={(checked) =>
                  setSelectedPlatforms((prev) =>
                    checked ? [...prev, p.value] : prev.filter((x) => x !== p.value)
                  )
                }
              />
              {p.label}
            </label>
          ))}
        </div>
        {error && <p className="mt-2 text-sm text-orange-600">{error}</p>}
        <Button
          className="mt-3"
          disabled={pending || selectedPlatforms.length === 0}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await generateContentAction(project.id, selectedPlatforms);
              if (result.error) setError(result.error);
              router.refresh();
            })
          }
        >
          <Sparkles className="size-4" /> {pending ? "생성 중..." : "콘텐츠 생성"}
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {outputs.map((output) => (
          <OutputCard key={output.id} output={output} />
        ))}
      </div>
    </div>
  );
}

function OutputCard({ output }: { output: ContentOutput }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(output.body ?? "");
  const [title, setTitle] = useState(output.title ?? "");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const meta = output.generation_metadata as { versions?: unknown[] } | null;
  const versionCount = Array.isArray(meta?.versions) ? meta!.versions!.length : 0;

  const platformLabel = PLATFORMS.find((p) => p.value === output.platform)?.label ?? output.platform;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <Badge variant="outline">{platformLabel}</Badge>
        <div className="flex items-center gap-1">
          {versionCount > 0 && (
            <Badge variant="outline" className="text-[10px]">
              <History className="size-3" /> 이전 버전 {versionCount}개
            </Badge>
          )}
          <Badge variant="secondary" className="text-[10px]">
            {output.status}
          </Badge>
        </div>
      </div>

      {editing ? (
        <div className="mt-3 space-y-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" />
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const fd = new FormData();
                  fd.set("outputId", output.id);
                  fd.set("title", title);
                  fd.set("body", body);
                  await updateContentOutputAction(fd);
                  setEditing(false);
                  router.refresh();
                })
              }
            >
              저장
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              취소
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-3 font-medium text-neutral-900">{output.title}</p>
          <p className="mt-1 text-sm text-neutral-600 whitespace-pre-wrap line-clamp-6">{output.body}</p>
          {output.hashtags && Array.isArray(output.hashtags) && (output.hashtags as string[]).length > 0 && (
            <p className="mt-2 text-xs text-sky-600">
              {(output.hashtags as string[]).map((h) => `#${h}`).join(" ")}
            </p>
          )}
        </>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {!editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" /> 수정
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigator.clipboard.writeText(output.body ?? "")}
        >
          <Copy className="size-3.5" /> 복사
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await generateContentAction(output.content_project_id, [output.platform]);
              router.refresh();
            })
          }
        >
          <RefreshCw className="size-3.5" /> 다시 생성
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => router.push(`/performance?contentOutputId=${output.id}`)}
        >
          <TrendingUp className="size-3.5" /> 성과 등록
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => startTransition(() => deleteContentOutputAction(output.id))}
        >
          <Trash2 className="size-3.5 text-orange-500" />
        </Button>
      </div>
    </div>
  );
}
