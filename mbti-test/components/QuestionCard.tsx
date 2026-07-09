"use client";

import { useState } from "react";
import type { Question, Trait } from "@/data/types";

interface QuestionCardProps {
  question: Question;
  direction: "forward" | "backward";
  onAnswer: (trait: Trait) => void;
}

const ANSWER_DELAY_MS = 180;

export function QuestionCard({ question, direction, onAnswer }: QuestionCardProps) {
  const [selectedTrait, setSelectedTrait] = useState<Trait | null>(null);

  const handleSelect = (trait: Trait) => {
    if (selectedTrait) return;
    setSelectedTrait(trait);
    window.setTimeout(() => onAnswer(trait), ANSWER_DELAY_MS);
  };

  const animationClass =
    direction === "forward"
      ? "animate-[slide-in-forward_250ms_ease-out]"
      : "animate-[slide-in-backward_250ms_ease-out]";

  return (
    <div className={`flex flex-col gap-8 ${animationClass}`}>
      <h2 className="text-center text-xl leading-snug font-semibold text-foreground sm:text-2xl">
        {question.text}
      </h2>
      <div className="flex flex-col gap-3">
        {question.options.map((option) => {
          const isSelected = selectedTrait === option.trait;
          return (
            <button
              key={option.trait}
              type="button"
              onClick={() => handleSelect(option.trait)}
              disabled={selectedTrait !== null}
              className={`min-h-[56px] rounded-2xl border px-5 py-4 text-left text-base font-medium transition-colors duration-150 ${
                isSelected
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-foreground/10 bg-foreground/3 text-foreground hover:border-accent/40 hover:bg-accent-soft/60"
              }`}
            >
              {option.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
