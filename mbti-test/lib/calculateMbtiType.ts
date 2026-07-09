import type { Trait } from "@/data/types";

/**
 * 지표별 3문항 중 더 많이 선택된 특성을 채택하는 다수결 로직. (PRD 3-4)
 * 지표당 문항 수가 3(홀수)으로 고정돼 있어 동점은 발생하지 않는다.
 */
export function calculateMbtiType(answers: { questionId: number; trait: Trait }[]): string {
  const counts: Record<Trait, number> = {
    E: 0,
    I: 0,
    S: 0,
    N: 0,
    T: 0,
    F: 0,
    J: 0,
    P: 0,
  };

  for (const answer of answers) {
    counts[answer.trait] += 1;
  }

  const dichotomies: [Trait, Trait][] = [
    ["E", "I"],
    ["S", "N"],
    ["T", "F"],
    ["J", "P"],
  ];

  return dichotomies.map(([a, b]) => (counts[a] > counts[b] ? a : b)).join("");
}
