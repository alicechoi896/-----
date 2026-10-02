import "server-only";

/**
 * 프롬프트 템플릿.
 * - id 는 Generator Config 의 promptId 와 같다.
 * - 내용을 바꾸면 version 을 올리고 changelog 에 이유를 남긴다 (생성 결과에 version 이 저장된다).
 * - 버전 규칙: MAJOR(출력 구조 변경) . MINOR(지시 추가·변경) . PATCH(문구 수정)
 */
export interface PromptTemplate {
  id: string;
  version: string;
  description: string;
  changelog: { version: string; date: string; note: string }[];
  /** 역할과 고정 규칙. 호출마다 바뀌지 않는 부분 */
  system: string;
  /** 기능별 작업 지시 (사용자 입력 앞에 들어간다) */
  task: string;
}
