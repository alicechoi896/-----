"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";

export interface EvidenceItem {
  id: string;
  evidence_text: string;
  relevance_score: number;
  data_sources: { title: string; created_at: string } | null;
  document_chunks: { content: string } | null;
}

export function EvidenceDrawer({
  open,
  onOpenChange,
  title,
  confidence,
  evidence,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  confidence?: number;
  evidence: EvidenceItem[];
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {confidence !== undefined
              ? `AI 신뢰도 ${Math.round(confidence * 100)}% · 근거 ${evidence.length}건`
              : `근거 ${evidence.length}건`}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-4 space-y-3 overflow-y-auto">
          {evidence.length === 0 && (
            <p className="text-sm text-neutral-400">등록된 근거가 없습니다. AI가 자체 추론한 내용입니다.</p>
          )}
          {evidence.map((ev) => (
            <div key={ev.id} className="rounded-xl border border-neutral-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs text-neutral-500 min-w-0">
                  <FileText className="size-3.5 shrink-0" />
                  <span className="truncate">{ev.data_sources?.title ?? "출처 미상"}</span>
                </div>
                <Badge variant="outline" className="shrink-0 text-xs">
                  신뢰도 {Math.round(ev.relevance_score * 100)}%
                </Badge>
              </div>
              {ev.data_sources?.created_at && (
                <p className="mt-0.5 text-[11px] text-neutral-400">
                  등록일 {new Date(ev.data_sources.created_at).toLocaleDateString("ko-KR")}
                </p>
              )}
              <p className="mt-2 text-sm text-neutral-700">{ev.evidence_text}</p>
              {ev.document_chunks?.content && (
                <p className="mt-2 text-xs text-neutral-500 bg-neutral-50 rounded-lg p-2 line-clamp-4">
                  {ev.document_chunks.content}
                </p>
              )}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
