/**
 * 사용 매뉴얼 데이터 형식 (docs/MANUAL.md)
 * 문장 안의 **굵게** 는 빨간 강조로 보인다 (버튼·메뉴 이름).
 */
export interface ManualStep {
  /** 화면의 강조 번호와 같다 (scripts/manual/shots.mjs 의 marks) */
  n: number;
  text: string;
}

export interface ManualSection {
  /** 주소 #앵커 */
  id: string;
  title: string;
  /** 제목 아래 한두 문장 */
  lead?: string;
  steps: ManualStep[];
  /** 스크린샷 id (lib/manual/shots.json). 없으면 글만 */
  shot?: string;
  /** 알아 두면 좋은 점 */
  tips?: string[];
  /** 아래 띠: 다음 단계 */
  next?: string;
}

export interface ManualFaq {
  q: string;
  a: string;
}

export interface ManualChapter {
  /** 00, 01 … A, B */
  no: string;
  id: string;
  title: string;
  summary: string;
  /** 관리자에게만 보이는 장 (웹 화면 목차 표시용. PDF 에는 모두 넣는다) */
  adminOnly?: boolean;
  sections: ManualSection[];
  faq?: ManualFaq[];
}

export interface ManualShot {
  file: string;
  w: number;
  h: number;
  boxes: { n: number; x: number; y: number; w: number; h: number }[];
}
