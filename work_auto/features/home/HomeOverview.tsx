"use client";

import Link from "next/link";
import { ArrowRight, History, KeyRound, Library } from "lucide-react";
import { api } from "@/lib/api-client";
import { findFeature } from "@/lib/registry";
import { useAsync } from "@/lib/hooks/useAsync";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState, LoadingState } from "@/components/ui/States";
import { formatRelative } from "@/lib/utils";

const PROVIDER_NAME = { claude: "Claude", openai: "OpenAI", youtube: "YouTube Data API", naver: "NAVER API", "naver-searchad": "NAVER 검색광고" } as const;

/** 메인 화면 하단: 최근 생성, 제품 라이브러리, API 연결 상태 요약 */
export function HomeOverview() {
  const contents = useAsync(() => api.contents.list(), []);
  const products = useAsync(() => api.products.list(), []);
  const connections = useAsync(() => api.connections.list(), []);

  return (
    <div className="mt-10 grid gap-4 lg:grid-cols-3">
      <SectionCard
        title="최근 생성한 콘텐츠"
        icon={History}
        className="lg:col-span-2"
        flush
        actions={<MoreLink href="/ai-learning" label="전체 보기" />}
      >
        {contents.loading ? (
          <LoadingState variant="skeleton" rows={3} className="p-5" />
        ) : !contents.data?.length ? (
          <EmptyState compact title="아직 생성한 콘텐츠가 없습니다" description="채널을 선택해 첫 콘텐츠를 만들어 보세요." />
        ) : (
          <ul className="divide-y divide-line">
            {contents.data.slice(0, 5).map((c) => {
              const f = findFeature(c.featureId);
              return (
                <li key={c.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-fg">{c.headline}</p>
                    <p className="mt-0.5 text-xs text-fg-subtle">{f?.title ?? c.featureId}</p>
                  </div>
                  <span className="shrink-0 text-xs text-fg-subtle">{formatRelative(c.createdAt)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <div className="flex flex-col gap-4">
        <SectionCard title="제품 라이브러리" icon={Library} actions={<MoreLink href="/tools/product-library" label="열기" />}>
          {products.loading ? (
            <LoadingState variant="skeleton" rows={1} />
          ) : (
            <div className="flex items-end justify-between">
              <p className="tabular text-3xl font-bold text-fg">
                {products.data?.length ?? 0}
                <span className="ml-1 text-sm font-medium text-fg-subtle">개 제품</span>
              </p>
              <Link href="/tools/product-learning" className="text-[13px] font-medium text-brand hover:underline">
                + 제품 학습하기
              </Link>
            </div>
          )}
        </SectionCard>

        <SectionCard title="API 연결" icon={KeyRound} actions={<MoreLink href="/settings/api" label="관리" />}>
          {connections.loading ? (
            <LoadingState variant="skeleton" rows={3} />
          ) : (
            <ul className="space-y-2.5">
              {connections.data?.map((c) => (
                <li key={c.provider} className="flex items-center justify-between text-sm">
                  <span className="text-fg-muted">{PROVIDER_NAME[c.provider]}</span>
                  <StatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function MoreLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-0.5 text-[13px] text-fg-subtle hover:text-fg">
      {label}
      <ArrowRight className="size-3.5" />
    </Link>
  );
}
