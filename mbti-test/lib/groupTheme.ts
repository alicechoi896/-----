import type { MbtiGroup } from "@/data/types";

interface GroupThemeClasses {
  bg: string;
  bgSoft: string;
  text: string;
  border: string;
}

/**
 * Tailwind는 클래스명이 소스에 정적으로 존재해야 인식하므로,
 * 그룹 → 클래스명을 동적으로 조합하지 않고 고정 문자열로 매핑한다.
 */
export const groupThemeClasses: Record<MbtiGroup, GroupThemeClasses> = {
  NT: { bg: "bg-group-nt", bgSoft: "bg-group-nt-soft", text: "text-group-nt-strong", border: "border-group-nt" },
  NF: { bg: "bg-group-nf", bgSoft: "bg-group-nf-soft", text: "text-group-nf-strong", border: "border-group-nf" },
  SJ: { bg: "bg-group-sj", bgSoft: "bg-group-sj-soft", text: "text-group-sj-strong", border: "border-group-sj" },
  SP: { bg: "bg-group-sp", bgSoft: "bg-group-sp-soft", text: "text-group-sp-strong", border: "border-group-sp" },
};
