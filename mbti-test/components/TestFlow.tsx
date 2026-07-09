"use client";

import { useEffect, useRef, useState } from "react";
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
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const previousIndexRef = useRef(progress.currentQuestionIndex);

  useEffect(() => {
    if (progress.currentQuestionIndex > previousIndexRef.current) {
      setDirection("forward");
    } else if (progress.currentQuestionIndex < previousIndexRef.current) {
      setDirection("backward");
    }
    previousIndexRef.current = progress.currentQuestionIndex;
  }, [progress.currentQuestionIndex]);

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
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="border-accent-soft border-t-accent h-10 w-10 animate-spin rounded-full border-4" />
        <p className="text-foreground/70">결과를 계산하고 있어요...</p>
      </div>
    );
  }

  const currentQuestion = questions[progress.currentQuestionIndex];

  const handleAnswer = (trait: Trait) => {
    answerCurrent(currentQuestion.id, trait);
  };

  return (
    <div className="flex w-full flex-1 flex-col px-5">
      <ProgressBar current={progress.currentQuestionIndex + 1} total={questions.length} />
      <div className="flex flex-1 flex-col justify-center py-6">
        <QuestionCard
          key={currentQuestion.id}
          question={currentQuestion}
          direction={direction}
          onAnswer={handleAnswer}
        />
      </div>
      <div className="flex justify-center pb-8">
        <button
          type="button"
          onClick={goToPrevious}
          disabled={!canGoToPrevious}
          className="min-h-[44px] px-4 text-sm font-medium text-foreground/50 transition-colors hover:text-foreground disabled:opacity-0"
        >
          ← 이전 문항
        </button>
      </div>
    </div>
  );
}
