"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createCampaignAndGenerateAction, type CampaignActionState } from "./actions";
import type { Database } from "@/types/database";
import type { ScreenMode } from "@/lib/access/screen-mode";
import { FlaskConical, Plus } from "lucide-react";

type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];

const GOALS: { value: string; label: string }[] = [
  { value: "awareness", label: "인지도" },
  { value: "views", label: "조회" },
  { value: "saves", label: "저장" },
  { value: "inquiries", label: "문의" },
  { value: "consultations", label: "상담" },
  { value: "purchases", label: "구매" },
];

const PLATFORMS = ["naver_blog", "instagram", "threads", "youtube_shorts", "newsletter", "landing_page"];
const PLATFORM_LABEL: Record<string, string> = {
  naver_blog: "네이버 블로그",
  instagram: "인스타그램",
  threads: "스레드",
  youtube_shorts: "유튜브 쇼츠",
  newsletter: "뉴스레터",
  landing_page: "랜딩페이지",
};

const GOAL_LABEL = Object.fromEntries(GOALS.map((g) => [g.value, g.label]));

interface CampaignSummary {
  campaign: Campaign;
  latestRunId: string | null;
  latestRunStatus: string | null;
  optionCount: number;
  selectedFinalScore: number | null;
}

const initialState: CampaignActionState = { error: null };

export function StrategyHomeClient({
  summaries,
  products,
  screenMode,
}: {
  summaries: CampaignSummary[];
  products: { id: string; name: string; summary: string | null }[];
  screenMode: ScreenMode;
}) {
  const [showForm, setShowForm] = useState(summaries.length === 0);

  return (
    <div className="p-6 max-w-[1440px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium tracking-wide text-violet-600 uppercase">
            {screenMode === "technical" ? "전략 시뮬레이터" : "캠페인 전략"}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-neutral-900">
            AI가 기업 데이터를 근거로 마케팅 전략 4개를 비교합니다
          </h1>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus className="size-4" /> {showForm ? "목록 보기" : "새 전략 분석"}
        </Button>
      </div>

      {showForm && <CampaignForm products={products} />}

      {!showForm && (
        <div className="space-y-3">
          {summaries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center text-neutral-500">
              아직 생성된 캠페인이 없습니다. &apos;새 전략 분석&apos;으로 시작하세요.
            </div>
          ) : (
            summaries.map(({ campaign, latestRunId, latestRunStatus, optionCount, selectedFinalScore }) => (
              <Link
                key={campaign.id}
                href={latestRunId ? `/strategy/${campaign.id}` : "#"}
                className="block rounded-2xl border border-neutral-200 bg-white p-4 hover:border-violet-300 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <FlaskConical className="size-4 text-violet-600" />
                      <p className="font-medium text-neutral-900">{campaign.name}</p>
                      <Badge variant="outline" className="text-xs">
                        목표: {GOAL_LABEL[campaign.goal]}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-neutral-500">{campaign.current_problem}</p>
                    {Array.isArray(campaign.platforms) && campaign.platforms.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(campaign.platforms as string[]).map((p) => (
                          <Badge key={p} variant="outline" className="text-[10px] text-neutral-500">
                            {PLATFORM_LABEL[p] ?? p}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-neutral-400">
                      {latestRunStatus === "completed" ? `전략 ${optionCount}개 생성됨` : "생성 대기중"}
                    </p>
                    {selectedFinalScore !== null && (
                      <p className="text-sm font-semibold text-violet-700">
                        선택된 전략 점수 {selectedFinalScore}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function CampaignForm({ products }: { products: { id: string; name: string; summary: string | null }[] }) {
  const [state, action, pending] = useActionState(createCampaignAndGenerateAction, initialState);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const selectedProduct = products.find((p) => p.id === selectedProductId) ?? null;

  return (
    <form action={action} className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-4 max-w-2xl">
      <div className="space-y-1.5">
        <Label htmlFor="name">캠페인명</Label>
        <Input id="name" name="name" required placeholder="예: 여름 신규 클래스 오픈 캠페인" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>상품</Label>
          <Select name="productEntityId" value={selectedProductId} onValueChange={setSelectedProductId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="상품 선택 (선택)" />
            </SelectTrigger>
            <SelectContent>
              {products.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-neutral-400">
                  등록된 상품이 없습니다. 내 비즈니스에서 자료를 먼저 등록하세요.
                </p>
              ) : (
                products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <p className="text-xs text-neutral-400">
            {selectedProduct?.summary
              ? `내 브랜드 정보에서 추출된 상품: ${selectedProduct.summary}`
              : "내 비즈니스 > 내 브랜드 정보에서 AI가 추출한 상품 목록입니다."}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>목표</Label>
          <Select name="goal" required defaultValue="inquiries">
            <SelectTrigger className="w-full">
              <SelectValue placeholder="목표 선택" />
            </SelectTrigger>
            <SelectContent>
              {GOALS.map((g) => (
                <SelectItem key={g.value} value={g.value}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="audience">고객</Label>
        <Input id="audience" name="audience" required placeholder="예: 온라인 판매를 시작한 1인 사업자" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="currentProblem">현재 문제</Label>
        <Textarea
          id="currentProblem"
          name="currentProblem"
          required
          rows={3}
          placeholder="예: 조회수는 나오는데 상담 문의로 이어지지 않는다"
        />
      </div>

      <div className="space-y-1.5">
        <Label>플랫폼</Label>
        <div className="grid grid-cols-2 gap-2">
          {PLATFORMS.map((p) => (
            <label key={p} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selectedPlatforms.includes(p)}
                onCheckedChange={(checked) => {
                  setSelectedPlatforms((prev) =>
                    checked ? [...prev, p] : prev.filter((x) => x !== p)
                  );
                }}
              />
              {selectedPlatforms.includes(p) && <input type="hidden" name="platforms" value={p} />}
              {PLATFORM_LABEL[p]}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="periodStart">운영 시작일</Label>
          <Input id="periodStart" name="periodStart" type="date" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="periodEnd">운영 종료일</Label>
          <Input id="periodEnd" name="periodEnd" type="date" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="extraConditions">추가 조건 (선택)</Label>
        <Textarea id="extraConditions" name="extraConditions" rows={2} />
      </div>

      {state.error && <p className="text-sm text-orange-600">{state.error}</p>}

      <Button type="submit" disabled={pending || selectedPlatforms.length === 0}>
        {pending ? "AI가 기업 데이터를 검색하고 전략을 생성하는 중..." : "AI 전략 생성 시작"}
      </Button>
      {selectedPlatforms.length === 0 && (
        <p className="text-xs text-neutral-400">플랫폼을 최소 1개 선택하세요.</p>
      )}
    </form>
  );
}
