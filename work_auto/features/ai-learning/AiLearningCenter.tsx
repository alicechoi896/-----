"use client";

import { useState } from "react";
import { BarChart3, History, MessageSquare, Package, Palette, Plus } from "lucide-react";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import { StatTile, Tabs, type TabItem } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ContentHistoryTab } from "./ContentHistoryTab";
import { FeedbackTab } from "./FeedbackTab";
import { PerformanceTab } from "./PerformanceTab";
import { ProductMemoryTab } from "./ProductMemoryTab";
import { StyleTab } from "./StyleTab";

type TabKey = "products" | "styles" | "contents" | "feedback" | "performance";

/** 생성 시 Context 로 들어가는 순서 (docs/AI_LEARNING_SYSTEM.md) */
const FLOW = ["고정 프롬프트", "제품 데이터", "스타일 데이터", "과거 좋은 결과물", "성과 데이터", "현재 트렌드"];

/**
 * AI 학습 관리 — "학습" = Fine-tuning 이 아니라, 저장 데이터를 생성 시 Context 로 주입하는 것.
 * 이 화면에서 각 Memory 를 확인하고 관리한다.
 */
const TAB_KEYS: TabKey[] = ["products", "styles", "contents", "feedback", "performance"];

export function AiLearningCenter({ initialTab, styleRef, styleChannel }: { initialTab?: string; styleRef?: string; styleChannel?: string }) {
  const [tab, setTab] = useState<TabKey>(TAB_KEYS.includes(initialTab as TabKey) ? (initialTab as TabKey) : "products");
  const overview = useAsync(() => api.memory.overview(), [tab]);
  const c = overview.data?.counts;

  const items: TabItem<TabKey>[] = [
    { value: "products", label: "제품 데이터", icon: Package, count: c?.products },
    { value: "styles", label: "나의 스타일", icon: Palette, count: c?.styles },
    { value: "contents", label: "콘텐츠 히스토리", icon: History, count: c?.contents },
    { value: "feedback", label: "피드백", icon: MessageSquare, count: c?.feedback },
    { value: "performance", label: "성과 데이터", icon: BarChart3, count: c?.performance },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-card border border-line bg-subtle/70 px-5 py-4">
        <p className="text-[13px] font-semibold text-fg">AI 생성 흐름</p>
        <p className="mt-0.5 text-xs text-fg-subtle">AI는 아무 정보 없이 호출되지 않습니다. 생성할 때마다 아래 데이터를 불러와 Context로 함께 전달합니다.</p>
        <ol className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
          {FLOW.map((step, i) => (
            <li key={step} className="flex items-center gap-1.5">
              <span className={cn("rounded-full px-2.5 py-1 font-medium ring-1", i === 0 ? "bg-fg text-white ring-fg" : "bg-canvas text-fg-muted ring-line")}>
                {step}
              </span>
              {i < FLOW.length - 1 && <Plus className="size-3 text-fg-subtle" />}
            </li>
          ))}
          <li className="ml-1 rounded-full bg-brand px-2.5 py-1 font-semibold text-white">→ AI 생성</li>
        </ol>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="제품 메모리" value={c?.products ?? "-"} unit="개" hint="재분석 없이 재사용" />
        <StatTile label="스타일" value={c?.styles ?? "-"} unit="개" hint="채널별 기본 스타일 적용" />
        <StatTile label="좋은 결과" value={c?.exemplars ?? "-"} unit="건" hint={`전체 생성 ${c?.contents ?? 0}건 중`} />
        <StatTile label="피드백" value={c?.feedback ?? "-"} unit="건" hint="별로예요 사유는 다음 생성에 반영" />
      </div>

      <div>
        <Tabs items={items} value={tab} onChange={setTab} />
        <div className="pt-5">
          {tab === "products" && <ProductMemoryTab />}
          {tab === "styles" && <StyleTab initialReference={styleRef} initialChannel={styleChannel} />}
          {tab === "contents" && <ContentHistoryTab />}
          {tab === "feedback" && <FeedbackTab />}
          {tab === "performance" && <PerformanceTab />}
        </div>
      </div>
    </div>
  );
}
