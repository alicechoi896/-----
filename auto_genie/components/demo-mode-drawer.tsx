"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2 } from "lucide-react";

const STEPS = [
  {
    title: "1. 기업 데이터 등록",
    description:
      "URL, 텍스트, 파일을 등록해 AI가 학습할 원천 데이터를 만듭니다. 인더업 시연 워크스페이스에는 이미 등록된 자료가 있습니다.",
    href: "/learning",
  },
  {
    title: "2. AI 분석 파이프라인",
    description:
      "등록된 자료가 추출 → 정제 → 분할 → 임베딩 → 지식 추출 → 관계 분석 → 마케팅 브레인 반영 단계를 거치는 과정을 확인합니다.",
    href: "/learning?tab=pipeline",
  },
  {
    title: "3. 기업 DNA와 지식그래프",
    description: "AI가 추출한 기업의 전문성, 고객 문제, 해결책, 브랜드 표현을 지식그래프로 확인합니다.",
    href: "/brain",
  },
  {
    title: "4. 전략 후보 비교",
    description: "AI가 생성한 4개의 마케팅 전략을 근거 점수와 함께 비교하고 하나를 선택합니다.",
    href: "/strategy",
  },
  {
    title: "5. 플랫폼별 콘텐츠 생성",
    description: "선택한 전략을 블로그, 인스타그램, 스레드, 쇼츠, 뉴스레터 콘텐츠로 동시에 변환합니다.",
    href: "/orchestrator",
  },
  {
    title: "6. 성과 피드백",
    description: "콘텐츠 성과를 입력하면 AI가 원인을 분석하고 다음 전략 추천에 반영합니다.",
    href: "/performance",
  },
  {
    title: "7. AI 기술 구조",
    description: "실제 데이터베이스 수치를 기반으로 시스템의 기술 계층과 구현 상태를 확인합니다.",
    href: "/technology",
  },
  {
    title: "8. 참조 URL 분석",
    description:
      "블로그·유튜브·인스타그램 등 참조 URL을 등록하면 URL 유효성 검사부터 결과 생성까지 7단계 분석 파이프라인이 진행됩니다. (시제품 예시 데이터)",
    href: "/learning/reference-analysis",
  },
  {
    title: "9. 콘텐츠 구조 규칙 추출",
    description: "훅 유형, 전개 구조, CTA 위치, 문장 스타일이 구조화된 분석 결과와 근거를 확인합니다.",
    href: "/learning/reference-analysis",
  },
  {
    title: "10. 마케팅 브레인 반영",
    description: "'마케팅 브레인에 반영' 버튼으로 추출된 구조 규칙이 AI 브레인 버전에 학습되는 과정을 확인합니다.",
    href: "/learning/reference-analysis",
  },
  {
    title: "11. 전략 추천 및 근거 확인",
    description: "전략 시뮬레이터의 'AI 추천 근거' 패널에서 추천 신뢰도, 근거 데이터, 적용된 생성 규칙을 확인합니다.",
    href: "/strategy",
  },
  {
    title: "12. 성과 기반 생성 규칙 변경",
    description: "성과 데이터 수집부터 생성 가이드 갱신까지, 콘텐츠 요소별 가중치가 조정되는 과정을 확인합니다.",
    href: "/performance/rule-update",
  },
  {
    title: "13. AI 브레인 버전 업데이트",
    description: "'AI 브레인에 적용' 버튼으로 생성 규칙 변경 사항이 새 버전에 반영되는 과정을 확인합니다.",
    href: "/performance/rule-update",
  },
  {
    title: "14. 변경 전후 콘텐츠 비교",
    description: "이전 버전과 업데이트된 버전의 생성 결과를 나란히 비교합니다.",
    href: "/performance/rule-update#before-after",
  },
];

export function DemoModeDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const router = useRouter();
  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-violet-700">면접 시연 모드</SheetTitle>
          <SheetDescription>
            이미 준비된 시연용 데이터를 순서대로 안내합니다. 데이터를 조작하지 않고 화면 이동만
            안내합니다.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-4 flex-1 flex flex-col gap-6">
          <div className="flex gap-1.5">
            {STEPS.map((s, i) => (
              <div
                key={s.title}
                className={`h-1.5 flex-1 rounded-full ${
                  i <= stepIndex ? "bg-violet-600" : "bg-neutral-200"
                }`}
              />
            ))}
          </div>

          <div className="rounded-xl border border-neutral-200 p-4 bg-violet-50/50">
            <p className="font-semibold text-neutral-900">{step.title}</p>
            <p className="mt-2 text-sm text-neutral-600 leading-relaxed">{step.description}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => router.push(step.href)}
            >
              이 화면으로 이동 <ArrowRight className="size-3.5" />
            </Button>
          </div>

          <div className="flex gap-2 mt-auto">
            <Button
              variant="ghost"
              disabled={stepIndex === 0}
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            >
              이전
            </Button>
            {isLast ? (
              <Button className="flex-1" onClick={() => onOpenChange(false)}>
                <CheckCircle2 className="size-4" /> 시연 완료
              </Button>
            ) : (
              <Button className="flex-1" onClick={() => setStepIndex((i) => i + 1)}>
                다음 단계 <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
