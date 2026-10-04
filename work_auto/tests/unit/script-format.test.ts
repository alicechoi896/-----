import { describe, expect, it } from "vitest";
import { cleanScriptExamples, formatViews, parseScriptFile, parseViews, promptExamples, scriptFormatTypeOf } from "@/lib/script-format";

// 실제로 받은 메모장 파일 모양 (제목·썸넬·조회수 줄, 구분선, 빈 줄 여러 개, 음성 인식 잡음)
const FILE_A = `4.2만회
제목 :  아이패드 에어 살까? 프로살까? 고민 중이라면 꼭 보세요!
썸넬 : 아이패드 에어 vs 프로 고민이라면 보세요

아이패드 미니 7세대 이런 걸 왜
사지 경쟁자 없는 압도적 성능 a17 Pro 칩셋 탑재
8기가램 폰이랑 비슷한 무게 293g
아래 링크를 확인해 보세요





7.8만
제목 :  아이패드 미니 7세대, 이런 걸 왜 사지?
썸넬 : 아이패드 미니7 이런 걸 왜 사지?
아이패드 미니 7세대 이런 걸 왜
사지 경쟁자 없는 압도적 성능 a17 Pro 칩셋 탑재
8기가램 폰이랑 비슷한 무게 293g
아래 링크를 확인해 보세요

-------------------------------------------

제목 : LG스탠바이미 산 거 후회 중.....
스탠바이미 노리는 분들
이제야 산 거
후회 중입니다
내일 바로 받을 수 있고
아래 제품 눌러 확인 해 보세요!
[음악]`;

const FILE_B = `📌 제목
갤럭시워치7 블루투스 vs 셀룰러? 비교분석
🎬 쇼츠 스크립트
갤럭시 워치7
아무거나 사면 후회합니다
셀룰러 모델은
스마트폰 없이도
워치 단독 사용이 가능해요.


닌텐도 스위치2 발표 40초 요약



🎬 제목:
갤럭시워치7 블루투스 vs LTE 셀룰러, 뭐 살지 정해드립니다!

🖼️ 썸넬 문구:
갤럭시워치7, 블루투스 살까 셀룰러 살까?
갤럭시 워치7
블루투스 살까 셀룰러 살까 고민되시죠?
스마트폰 없이 워치 단독 사용하고 싶다면 셀룰러!`;

describe("대본 포맷: 메모장 파일 나누기", () => {
  it("조회수 줄·제목 줄·구분선·빈 줄 여러 개로 나누고, 같은 대본은 한 번만", () => {
    const list = parseScriptFile(FILE_A);
    expect(list).toHaveLength(2); // 두 번째는 첫 번째와 본문이 같다
    expect(list[0]).toMatchObject({ title: "아이패드 에어 살까? 프로살까? 고민 중이라면 꼭 보세요!", views: 42_000 });
    expect(list[0].text).not.toMatch(/썸넬/);
    expect(list[1].title).toBe("LG스탠바이미 산 거 후회 중.....");
    expect(list[1].text).not.toContain("[음악]");
  });

  it("이모지 제목·'쇼츠 스크립트' 머리말·30자 미만 조각", () => {
    const list = parseScriptFile(FILE_B);
    expect(list.map((x) => x.title)).toEqual(["갤럭시워치7 블루투스 vs 셀룰러? 비교분석", "갤럭시워치7 블루투스 vs LTE 셀룰러, 뭐 살지 정해드립니다!"]);
    expect(list[0].text.startsWith("갤럭시 워치7")).toBe(true);
    expect(list.some((x) => x.text.includes("닌텐도 스위치2 발표"))).toBe(false); // 짧은 메모 줄은 버린다
    expect(list[1].text).not.toMatch(/썸넬/);
  });

  it("조회수 읽기", () => {
    expect(parseViews("4.2만회")).toBe(42_000);
    expect(parseViews("1만")).toBe(10_000);
    expect(parseViews("5.4천회")).toBe(5_400);
    expect(parseViews("12,000회")).toBe(12_000);
    expect(parseViews("2025")).toBeNull(); // '회' 나 단위 없는 숫자는 본문
    expect(formatViews(42_000)).toBe("4.2만회");
  });

  it("저장 전 정리: 중복·빈 대본 제거, 30개 제한, 생성용 예시는 조회수 높은 순 2개", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ title: `t${i}`, views: i, text: `대본 ${i} `.repeat(10) }));
    const cleaned = cleanScriptExamples([...many, { text: "" }, { text: many[0].text }]);
    expect(cleaned).toHaveLength(30);
    expect(promptExamples(cleaned).map((e) => e.views)).toEqual([29, 28]);
  });

  it("영상·클립만 포맷 유형이 있다", () => {
    expect(scriptFormatTypeOf("yt-product-video")).toBe("product");
    expect(scriptFormatTypeOf("clip-info-content")).toBe("info");
    expect(scriptFormatTypeOf("blog-product-writing")).toBeNull();
  });
});
