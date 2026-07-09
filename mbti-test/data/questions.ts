import type { Question } from "./types";

/**
 * 4개 지표(EI/SN/TF/JP)가 골고루 섞이도록 EI→SN→TF→JP 순서를 3회 반복 배치한다. (PRD 3-1)
 */
export const questions: Question[] = [
  {
    id: 1,
    dichotomy: "EI",
    text: "친구들과 오랜 시간 어울리고 난 뒤 나는?",
    options: [
      { text: "에너지가 더 충전된다", trait: "E" },
      { text: "혼자만의 시간이 필요해진다", trait: "I" },
    ],
  },
  {
    id: 2,
    dichotomy: "SN",
    text: "설명을 들을 때 나는?",
    options: [
      { text: "구체적인 사실과 예시가 먼저 궁금하다", trait: "S" },
      { text: "전체적인 그림과 가능성이 먼저 궁금하다", trait: "N" },
    ],
  },
  {
    id: 3,
    dichotomy: "TF",
    text: "친구가 고민을 털어놓으면 나는?",
    options: [
      { text: "원인을 분석하고 해결책을 제시한다", trait: "T" },
      { text: "먼저 마음에 공감하고 위로한다", trait: "F" },
    ],
  },
  {
    id: 4,
    dichotomy: "JP",
    text: "여행을 갈 때 나는?",
    options: [
      { text: "일정을 미리 촘촘히 계획한다", trait: "J" },
      { text: "그때그때 상황에 맞춰 움직인다", trait: "P" },
    ],
  },
  {
    id: 5,
    dichotomy: "EI",
    text: "새로운 모임에 가면 나는?",
    options: [
      { text: "먼저 다가가 말을 건다", trait: "E" },
      { text: "분위기를 살피며 조용히 관찰한다", trait: "I" },
    ],
  },
  {
    id: 6,
    dichotomy: "SN",
    text: "새로운 아이디어를 들으면 나는?",
    options: [
      { text: "실제로 어떻게 적용될지부터 생각한다", trait: "S" },
      { text: "숨겨진 의미나 확장 가능성을 상상한다", trait: "N" },
    ],
  },
  {
    id: 7,
    dichotomy: "TF",
    text: "결정을 내릴 때 나에게 더 중요한 기준은?",
    options: [
      { text: "논리와 객관적 사실", trait: "T" },
      { text: "사람들의 감정과 관계", trait: "F" },
    ],
  },
  {
    id: 8,
    dichotomy: "JP",
    text: "마감이 있는 일을 할 때 나는?",
    options: [
      { text: "여유 있게 미리 끝내야 마음이 편하다", trait: "J" },
      { text: "마감이 다가와야 집중력이 발휘된다", trait: "P" },
    ],
  },
  {
    id: 9,
    dichotomy: "EI",
    text: "주말을 보내는 이상적인 방법은?",
    options: [
      { text: "사람 많은 곳에서 활동적으로 보낸다", trait: "E" },
      { text: "집에서 혼자 조용히 쉰다", trait: "I" },
    ],
  },
  {
    id: 10,
    dichotomy: "SN",
    text: "나는 대체로 이런 사람에 가깝다",
    options: [
      { text: "현실적이고 실용적인 사람", trait: "S" },
      { text: "상상력이 풍부하고 아이디어가 많은 사람", trait: "N" },
    ],
  },
  {
    id: 11,
    dichotomy: "TF",
    text: "누군가에게 싫은 소리를 해야 할 때 나는?",
    options: [
      { text: "돌려 말하지 않고 사실대로 말한다", trait: "T" },
      { text: "상대가 상처받지 않도록 표현을 고른다", trait: "F" },
    ],
  },
  {
    id: 12,
    dichotomy: "JP",
    text: "내 책상이나 방 상태는 대체로?",
    options: [
      { text: "정리정돈이 잘 되어 있다", trait: "J" },
      { text: "필요한 것들이 자유롭게 놓여 있다", trait: "P" },
    ],
  },
];
