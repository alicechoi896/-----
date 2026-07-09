"use client";

import { useMemo, useState } from "react";
import type { Trait } from "@/data/types";

export interface TestProgress {
  currentQuestionIndex: number;
  answers: { questionId: number; trait: Trait }[];
}

/**
 * 세션 내 메모리로만 진행 상태를 관리한다 — 새로고침 시 초기화되는 것이 의도된 동작이다. (PRD 7.2)
 */
export function useTestProgress(totalQuestions: number) {
  const [progress, setProgress] = useState<TestProgress>({
    currentQuestionIndex: 0,
    answers: [],
  });

  const isComplete = progress.currentQuestionIndex >= totalQuestions;

  const answerCurrent = (questionId: number, trait: Trait) => {
    setProgress((prev) => {
      const answers = prev.answers.filter((answer) => answer.questionId !== questionId);
      answers.push({ questionId, trait });
      return {
        currentQuestionIndex: prev.currentQuestionIndex + 1,
        answers,
      };
    });
  };

  const goToPrevious = () => {
    setProgress((prev) => ({
      ...prev,
      currentQuestionIndex: Math.max(0, prev.currentQuestionIndex - 1),
    }));
  };

  const canGoToPrevious = useMemo(() => progress.currentQuestionIndex > 0, [progress.currentQuestionIndex]);

  return {
    progress,
    isComplete,
    answerCurrent,
    goToPrevious,
    canGoToPrevious,
  };
}
