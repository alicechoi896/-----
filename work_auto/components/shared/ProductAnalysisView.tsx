import { Clapperboard, FileText, Info, Sparkles } from "lucide-react";
import type { ProductAnalysisContent } from "@/lib/types";
import { Tag } from "@/components/ui/Badge";
import { BulletList, InfoRow, SectionCard } from "@/components/ui/SectionCard";

/**
 * 제품 분석 결과 3단 구성 (제품 상세페이지 학습 / 제품 상세 공용)
 *  1. 기본 정보  2. AI 제품 요약  3. 콘텐츠 제작용 데이터
 */
export function ProductAnalysisView({ analysis }: { analysis: ProductAnalysisContent }) {
  const { basicInfo: b, summary: s, contentData: c } = analysis;
  return (
    <div className="space-y-4">
      <SectionCard title="기본 정보" icon={Info}>
        <dl className="divide-y divide-line">
          <InfoRow label="제품명">{b.name}</InfoRow>
          <InfoRow label="브랜드">{b.brand || "-"}</InfoRow>
          <InfoRow label="카테고리">{b.category || "-"}</InfoRow>
          <InfoRow label="판매처">{b.seller || "-"}</InfoRow>
          <InfoRow label="URL">
            {b.url ? (
              <a href={b.url} target="_blank" rel="noreferrer" className="break-all text-brand hover:underline">
                {b.url}
              </a>
            ) : (
              "-"
            )}
          </InfoRow>
        </dl>
      </SectionCard>

      <SectionCard title="AI 제품 요약" icon={Sparkles}>
        <p className="rounded-control bg-subtle px-4 py-3 text-[15px] font-medium text-fg">{s.oneLiner}</p>
        <div className="mt-5 grid gap-x-8 gap-y-6 md:grid-cols-2">
          <Group title="핵심 특징" items={s.keyFeatures} />
          <Group title="핵심 장점" items={s.keyBenefits} />
          <Group title="차별점" items={s.differentiators} />
          <Group title="추천 대상" items={s.targetAudience} />
          <Group title="구매 포인트" items={s.buyingPoints} />
          <Group title="주의할 점" items={s.cautions} tone="warning" />
        </div>
      </SectionCard>

      <SectionCard title="콘텐츠 제작용 데이터" icon={Clapperboard} description="콘텐츠를 생성할 때 Product Memory로 자동 주입됩니다.">
        <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
          <Group title="영상에서 강조할 포인트" items={c.videoPoints} />
          <Group title="블로그에서 강조할 포인트" items={c.blogPoints} icon={<FileText className="size-3.5" />} />
          <div>
            <GroupTitle>추천 키워드</GroupTitle>
            <div className="flex flex-wrap gap-1.5">
              {c.keywords.map((k) => (
                <Tag key={k}>{k}</Tag>
              ))}
            </div>
          </div>
          <Group title="추천 Hook" items={c.hooks} />
          <div className="md:col-span-2">
            <GroupTitle>사용하면 안 되는 표현</GroupTitle>
            <div className="flex flex-wrap gap-1.5">
              {c.forbiddenExpressions.map((k) => (
                <span key={k} className="inline-flex h-6 items-center rounded-md border border-danger/20 bg-danger-soft px-2 text-xs text-danger line-through decoration-danger/40">
                  {k}
                </span>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function GroupTitle({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return <h4 className="mb-2 flex items-center gap-1 text-xs font-semibold text-fg-subtle">{icon}{children}</h4>;
}

function Group({ title, items, tone, icon }: { title: string; items: string[]; tone?: "warning"; icon?: React.ReactNode }) {
  return (
    <div>
      <GroupTitle icon={icon}>{title}</GroupTitle>
      <div className={tone === "warning" ? "[&_li]:text-warning" : undefined}>
        <BulletList items={items} empty="원문에서 찾지 못함" />
      </div>
    </div>
  );
}
