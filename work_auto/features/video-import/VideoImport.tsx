"use client";

import { useState } from "react";
import { Download, Film, Info, Trash2 } from "lucide-react";
import type { ReferenceVideo } from "@/lib/types";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import {
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  FormField,
  IconButton,
  Input,
  LoadingState,
  Notice,
  SectionCard,
  type Column,
} from "@/components/ui";
import Link from "next/link";
import { VideoThumb } from "@/components/shared/VideoThumb";
import { formatRelative } from "@/lib/utils";

const PLATFORM = { youtube: "YouTube", naver: "NAVER", other: "기타" } as const;

/** 영상 URL 가져오기 — 저장한 영상은 '제품 홍보 영상 만들기'의 참고 영상으로 선택할 수 있다 */
export function VideoImport() {
  const list = useAsync(() => api.videos.list(), []);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    setImporting(true);
    setError(null);
    try {
      const video = await api.videos.import(url, note);
      list.setData((prev) => [video, ...(prev ?? [])]);
      setUrl("");
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "가져오기에 실패했습니다.");
    } finally {
      setImporting(false);
    }
  }

  async function handleRemove(v: ReferenceVideo) {
    await api.videos.remove(v.id);
    list.setData((prev) => prev?.filter((x) => x.id !== v.id) ?? null);
  }

  const columns: Column<ReferenceVideo>[] = [
    {
      key: "title",
      header: "영상",
      render: (v) => (
        <div className="flex items-center gap-3">
          <VideoThumb className="h-11 w-20" thumbnailUrl={v.thumbnailUrl} color={v.thumbnailColor} durationSec={v.durationSec} />
          <div className="min-w-0">
            <a href={v.url} target="_blank" rel="noreferrer" className="line-clamp-1 font-medium text-fg hover:text-brand">
              {v.title}
            </a>
            <p className="text-xs text-fg-subtle">
              {PLATFORM[v.platform]} · {v.channelName}
            </p>
          </div>
        </div>
      ),
    },
    { key: "note", header: "메모", render: (v) => <span className="text-fg-muted">{v.note ?? "-"}</span> },
    { key: "createdAt", header: "가져온 시각", render: (v) => <span className="text-fg-muted">{formatRelative(v.createdAt)}</span> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (v) => <IconButton icon={Trash2} label="삭제" onClick={() => handleRemove(v)} className="hover:text-danger" />,
    },
  ];

  return (
    <div className="space-y-5">
      <Notice tone="neutral" icon={Info}>
        다른 사람의 영상 파일 다운로드는 YouTube·NAVER 이용약관과 저작권 때문에 제공하지 않습니다. 여기서는 제목·채널·길이 같은 정보만 저장합니다.
        내가 가진 영상의 소리를 빼려면{" "}
        <Link href="/tools/video-mute" className="font-medium text-brand hover:underline">
          영상 음성 제거
        </Link>
        를 쓰세요.
      </Notice>
      <SectionCard title="영상 가져오기" description="YouTube, NAVER 클립 등 참고할 영상의 URL을 입력하세요.">
        <form
          className="grid items-end gap-3 md:grid-cols-[1fr_260px_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) handleImport();
          }}
        >
          <FormField label="영상 URL" htmlFor="video-url" error={error}>
            <Input id="video-url" type="url" placeholder="https://www.youtube.com/watch?v=…" value={url} onChange={(e) => setUrl(e.target.value)} />
          </FormField>
          <FormField label="메모" htmlFor="video-note" optional>
            <Input id="video-note" placeholder="예: Hook 구성 참고" value={note} onChange={(e) => setNote(e.target.value)} />
          </FormField>
          <Button type="submit" variant="primary" icon={Download} loading={importing} disabled={!url.trim()}>
            가져오기
          </Button>
        </form>
      </SectionCard>

      <SectionCard title="저장된 참고 영상" icon={Film} flush>
        {list.loading ? (
          <LoadingState variant="skeleton" rows={3} className="p-5" />
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : (
          <DataTable
            columns={columns}
            rows={list.data ?? []}
            rowKey={(v) => v.id}
            empty={<EmptyState compact title="가져온 영상이 없습니다" />}
          />
        )}
      </SectionCard>
    </div>
  );
}
