"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { questions } from "@/data/questions";
import { calculateMbtiType } from "@/lib/calculateMbtiType";
import { useTestProgress } from "@/hooks/useTestProgress";
import type { Trait } from "@/data/types";
import { ProgressBar } from "./ProgressBar";
import { QuestionCard } from "./QuestionCard";

const RESULT_TRANSITION_MS = 1400;

export function TestFlow() {
  const router = useRouter();
  const { progress, isComplete, answerCurrent, goToPrevious, canGoToPrevious } = useTestProgress(
    questions.length,
  );

  useEffect(() => {
    if (!isComplete) return;
    const mbtiType = calculateMbtiType(progress.answers);
    const timer = window.setTimeout(() => {
      router.push(`/result/${mbtiType}`);
    }, RESULT_TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [isComplete, progress.answers, router]);

  if (isComplete) {
    return (
      <div className="flex flex-1 animate-[appear_240ms_ease-out] flex-col items-center justify-center gap-5 px-6 text-center">
        <div className="border-accent-soft border-t-accent h-10 w-10 animate-spin rounded-full border-4" />
        <p className="text-foreground/60">결과를 계산하고 있어요...</p>
      </div>
    );
  }

  const currentQuestion = questions[progress.currentQuestionIndex];

  const handleAnswer = (trait: Trait) => {
    answerCurrent(currentQuestion.id, trait);
  };

  return (
    <div className="flex w-full flex-1 flex-col px-6">
      <ProgressBar current={progress.currentQuestionIndex + 1} total={questions.length} />
      <div className="flex flex-1 flex-col justify-center py-10">
        <QuestionCard key={currentQuestion.id} question={currentQuestion} onAnswer={handleAnswer} />
      </div>
      <div className="flex justify-center pb-10">
        <button
          type="button"
          onClick={goToPrevious}
          disabled={!canGoToPrevious}
          className="min-h-[44px] rounded-full px-5 text-sm font-medium text-foreground/45 transition-colors hover:bg-accent-soft hover:text-foreground disabled:opacity-0"
        >
          ← 이전 문항
        </button>
      </div>
    </div>
  );
}
