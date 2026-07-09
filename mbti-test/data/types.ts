export type Trait = "E" | "I" | "S" | "N" | "T" | "F" | "J" | "P";

export type Dichotomy = "EI" | "SN" | "TF" | "JP";

export type MbtiGroup = "NT" | "NF" | "SJ" | "SP";

export interface QuestionOption {
  text: string;
  trait: Trait;
}

export interface Question {
  id: number;
  dichotomy: Dichotomy;
  text: string;
  options: [QuestionOption, QuestionOption];
}

export interface MbtiTypeInfo {
  type: string;
  nickname: string;
  group: MbtiGroup;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendedJobs: string[];
}
