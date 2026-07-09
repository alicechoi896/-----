"use client";

import { useState } from "react";
import type { Question, Trait } from "@/data/types";

interface QuestionCardProps {
  question: Question;
  onAnswer: (trait: Trait) => void;
}

const ANSWER_DELAY_MS = 180;

export function QuestionCard({ question, onAnswer }: QuestionCardProps) {
  const [selectedTrait, setSelectedTrait] = useState<Trait | null>(null);

  const handleSelect = (trait: Trait) => {
    if (selectedTrait) return;
    setSelectedTrait(trait);
    window.setTimeout(() => onAnswer(trait), ANSWER_DELAY_MS);
  };

  return (
    <div className="flex animate-[appear_240ms_ease-out] flex-col gap-10">
      <h2 className="text-center text-xl leading-snug font-semibold text-balance text-foreground sm:text-2xl">
        {question.text}
      </h2>
      <div className="flex flex-col gap-4">
        {question.options.map((option) => {
          const isSelected = selectedTrait === option.trait;
          return (
            <button
              key={option.trait}
              type="button"
              onClick={() => handleSelect(option.trait)}
              disabled={selectedTrait !== null}
              className={`min-h-[56px] rounded-3xl border-2 px-6 py-4 text-left text-base font-medium transition-all duration-150 ${
                isSelected
                  ? "border-accent bg-accent text-ink"
                  : "border-foreground/10 bg-foreground/3 text-foreground hover:-translate-y-0.5 hover:border-accent hover:bg-accent-soft hover:shadow-sm"
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
