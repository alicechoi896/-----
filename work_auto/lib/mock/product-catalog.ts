import type { ProductAnalysisContent, RawProductData } from "@/lib/types";

/**
 * Mock 제품 카탈로그.
 * - MockProductCollector: URL 을 받으면 이 중 하나를 "수집 결과"로 돌려준다.
 * - MockAIProvider(product-analysis): raw.title 이 일치하면 아래 analysis 를 돌려준다.
 * - Seed: 앞의 3개는 처음부터 제품 라이브러리에 저장된 상태로 시작한다.
 * 브랜드와 제품은 모두 가상이다.
 */

export interface CatalogEntry {
  key: string;
  raw: Omit<RawProductData, "collectedAt" | "collectedBy" | "sourceType">;
  analysis: ProductAnalysisContent;
  tags: string[];
}

export const PRODUCT_CATALOG: CatalogEntry[] = [
  {
    key: "vacuum",
    tags: ["자취템", "청소", "무선"],
    raw: {
      url: "https://www.coupang.com/vp/products/7300001",
      seller: "쿠팡",
      title: "클린웨이브 무선청소기 S9 프로",
      brand: "클린웨이브",
      price: 189000,
      category: "생활가전 > 청소기",
      imageUrls: [],
      descriptionText:
        "최대 흡입력 180AW BLDC 모터. 1회 충전 최대 60분 사용(에코 모드). 무게 1.3kg 초경량 바디. 5단계 헤파 필터로 미세먼지 99.9% 차단. LED 먼지 감지 헤드. 거치대 일체형 충전. 원터치 먼지통 비움.",
      specs: { 흡입력: "180AW", 사용시간: "최대 60분(에코)", 무게: "1.3kg", 필터: "5단계 헤파", 충전시간: "3.5시간", 먼지통: "0.6L" },
      reviewSnippets: ["가벼워서 매일 쓰게 돼요", "LED 헤드 덕분에 먼지가 잘 보여요", "강모드는 배터리가 빨리 닳아요"],
    },
    analysis: {
      basicInfo: {
        name: "클린웨이브 무선청소기 S9 프로",
        brand: "클린웨이브",
        category: "생활가전 > 청소기",
        seller: "쿠팡",
        url: "https://www.coupang.com/vp/products/7300001",
      },
      summary: {
        oneLiner: "1.3kg 초경량 바디에 180AW 흡입력을 갖춘, 매일 쓰기 편한 무선청소기",
        keyFeatures: ["180AW BLDC 모터", "에코 모드 최대 60분 사용", "1.3kg 초경량", "LED 먼지 감지 헤드", "5단계 헤파 필터"],
        keyBenefits: ["가벼워서 손목 부담이 적다", "숨은 먼지가 눈에 보여 청소 완성도가 높다", "원터치 먼지통 비움으로 위생적이다"],
        differentiators: ["동급 대비 가벼운 무게(1.3kg)", "LED 먼지 감지 헤드 기본 탑재", "거치대 일체형 충전"],
        targetAudience: ["원룸·자취생", "반려동물 가정", "매일 짧게 청소하는 맞벌이 가구"],
        buyingPoints: ["20만 원 이하 가격대", "가벼운 무게와 긴 사용 시간의 균형", "헤파 필터로 배기 걱정 감소"],
        cautions: ["강 모드에서는 사용 시간이 크게 줄어든다", "먼지통 용량(0.6L)이 큰 편은 아니다", "충전 시간이 3.5시간으로 긴 편이다"],
      },
      contentData: {
        videoPoints: ["한 손으로 드는 무게감 비교 장면", "LED 헤드로 먼지가 보이는 Before/After", "원터치 먼지통 비우기 클로즈업"],
        blogPoints: ["스펙 표로 흡입력, 사용 시간, 무게 정리", "모드별 사용 시간 차이 안내", "원룸 기준 추천 이유"],
        keywords: ["무선청소기 추천", "가벼운 무선청소기", "자취 청소기", "헤파필터 청소기", "가성비 무선청소기"],
        hooks: ["청소기가 무거워서 안 꺼내게 된다면, 이 영상 보세요", "1.3kg 청소기로 먼지가 눈에 보이면 생기는 일"],
        forbiddenExpressions: ["세계 최강 흡입력", "먼지 100% 제거", "평생 사용 가능"],
      },
    },
  },
  {
    key: "airfryer",
    tags: ["주방", "요리", "오븐형"],
    raw: {
      url: "https://smartstore.naver.com/cookmaster/products/5520011",
      seller: "스마트스토어",
      title: "쿡마스터 오븐형 에어프라이어 12L",
      brand: "쿡마스터",
      price: 129000,
      category: "주방가전 > 에어프라이어",
      imageUrls: [],
      descriptionText:
        "12L 대용량 오븐형 구조로 통닭 한 마리 조리 가능. 상하 듀얼 히터로 뒤집지 않아도 고르게 익음. 투명 창으로 조리 과정 확인. 회전 바스켓, 3단 트레이 포함. 스테인리스 내부로 세척이 쉬움. 프리셋 12종.",
      specs: { 용량: "12L", 히터: "상하 듀얼", 소비전력: "1700W", 구성품: "회전 바스켓, 트레이 3종", 내부: "스테인리스", 프리셋: "12종" },
      reviewSnippets: ["뒤집을 필요가 없어서 편해요", "부피가 꽤 커요", "창으로 보이니 덜 태워요"],
    },
    analysis: {
      basicInfo: {
        name: "쿡마스터 오븐형 에어프라이어 12L",
        brand: "쿡마스터",
        category: "주방가전 > 에어프라이어",
        seller: "스마트스토어",
        url: "https://smartstore.naver.com/cookmaster/products/5520011",
      },
      summary: {
        oneLiner: "상하 듀얼 히터로 뒤집지 않아도 고르게 익는 12L 오븐형 에어프라이어",
        keyFeatures: ["12L 대용량 오븐형", "상하 듀얼 히터", "투명 조리창", "회전 바스켓·3단 트레이", "프리셋 12종"],
        keyBenefits: ["중간에 뒤집는 번거로움이 줄어든다", "조리 과정을 보면서 태움을 막을 수 있다", "여러 요리를 한 번에 할 수 있다"],
        differentiators: ["듀얼 히터 구조", "통닭 회전 조리 가능", "스테인리스 내부로 코팅 벗겨짐 걱정이 적다"],
        targetAudience: ["3~4인 가족", "홈베이킹 입문자", "에어프라이어를 바꾸려는 사람"],
        buyingPoints: ["바스켓형보다 넓은 조리 공간", "세척 편의성", "구성품이 풍부하다"],
        cautions: ["부피가 커서 설치 공간을 확인해야 한다", "소비전력이 높아 멀티탭 사용에 주의해야 한다"],
      },
      contentData: {
        videoPoints: ["투명 창으로 익어가는 모습 타임랩스", "통닭 회전 조리 장면", "바스켓형과 공간 비교"],
        blogPoints: ["바스켓형 vs 오븐형 비교 표", "프리셋별 추천 요리", "설치 공간·전력 체크리스트"],
        keywords: ["오븐형 에어프라이어", "대용량 에어프라이어", "에어프라이어 추천", "통닭 에어프라이어", "스테인리스 에어프라이어"],
        hooks: ["에어프라이어 돌리다가 또 뒤집으러 가셨나요?", "통닭이 통째로 돌아가는 에어프라이어"],
        forbiddenExpressions: ["기름 없이 100% 건강", "모든 요리 완벽 조리"],
      },
    },
  },
  {
    key: "massage-gun",
    tags: ["건강", "운동", "휴대용"],
    raw: {
      url: "https://www.coupang.com/vp/products/8810042",
      seller: "쿠팡",
      title: "릴렉스핏 미니 마사지건 M2",
      brand: "릴렉스핏",
      price: 59000,
      category: "건강가전 > 마사지기",
      imageUrls: [],
      descriptionText:
        "무게 380g 손바닥 크기 미니 마사지건. 5단계 강도 조절, 헤드 4종 구성. 저소음 설계 45dB. USB-C 충전, 1회 충전 최대 4시간. 파우치 포함으로 휴대 간편.",
      specs: { 무게: "380g", 강도: "5단계", 헤드: "4종", 소음: "약 45dB", 배터리: "최대 4시간", 충전: "USB-C" },
      reviewSnippets: ["가방에 넣고 다니기 좋아요", "강도가 생각보다 세요", "조용해서 사무실에서도 써요"],
    },
    analysis: {
      basicInfo: {
        name: "릴렉스핏 미니 마사지건 M2",
        brand: "릴렉스핏",
        category: "건강가전 > 마사지기",
        seller: "쿠팡",
        url: "https://www.coupang.com/vp/products/8810042",
      },
      summary: {
        oneLiner: "가방에 쏙 들어가는 380g 저소음 미니 마사지건",
        keyFeatures: ["380g 미니 사이즈", "5단계 강도", "헤드 4종", "약 45dB 저소음", "USB-C 충전"],
        keyBenefits: ["어디서나 꺼내 쓸 수 있다", "사무실에서도 부담 없는 소음", "부위별로 헤드를 바꿔 쓸 수 있다"],
        differentiators: ["손바닥 크기에 4시간 배터리", "USB-C 충전으로 별도 충전기가 필요 없다"],
        targetAudience: ["오래 앉아 일하는 직장인", "운동 전후 관리가 필요한 사람", "부모님 선물을 찾는 사람"],
        buyingPoints: ["5만 원대 가격", "휴대성", "선물용 파우치 구성"],
        cautions: ["의료기기가 아니므로 치료 효과를 표현하면 안 된다", "뼈 부위나 통증 부위에는 사용을 피하도록 안내해야 한다"],
      },
      contentData: {
        videoPoints: ["손바닥 위 크기 비교", "사무실 소음 테스트 장면", "헤드 4종 교체 장면"],
        blogPoints: ["부위별 헤드 사용법", "사용 시 주의사항", "선물 포장 구성"],
        keywords: ["미니 마사지건", "휴대용 마사지건", "저소음 마사지건", "직장인 선물", "마사지건 추천"],
        hooks: ["퇴근길 어깨가 돌처럼 굳었다면", "가방 속에 들어가는 380g 마사지건"],
        forbiddenExpressions: ["통증 치료", "디스크 개선", "의학적으로 입증"],
      },
    },
  },
  {
    key: "tumbler",
    tags: ["주방", "보온", "출근템"],
    raw: {
      url: "https://smartstore.naver.com/dailywear/products/4410087",
      seller: "스마트스토어",
      title: "데일리웨어 진공 텀블러 600ml",
      brand: "데일리웨어",
      price: 24900,
      category: "생활용품 > 텀블러",
      imageUrls: [],
      descriptionText:
        "이중 진공 단열로 보온 12시간, 보냉 24시간. 원터치 슬라이드 뚜껑, 차량 컵홀더 호환 슬림 바디. 내부 세라믹 코팅으로 커피 냄새 배임 감소. 600ml 대용량.",
      specs: { 용량: "600ml", 보온: "12시간", 보냉: "24시간", 내부: "세라믹 코팅", 뚜껑: "원터치 슬라이드" },
      reviewSnippets: ["커피 냄새가 덜 배요", "컵홀더에 딱 맞아요"],
    },
    analysis: {
      basicInfo: {
        name: "데일리웨어 진공 텀블러 600ml",
        brand: "데일리웨어",
        category: "생활용품 > 텀블러",
        seller: "스마트스토어",
        url: "https://smartstore.naver.com/dailywear/products/4410087",
      },
      summary: {
        oneLiner: "세라믹 코팅으로 커피 냄새 배임을 줄인 600ml 진공 텀블러",
        keyFeatures: ["이중 진공 단열", "보온 12시간·보냉 24시간", "세라믹 코팅 내부", "원터치 슬라이드 뚜껑"],
        keyBenefits: ["음료 맛 변화가 적다", "한 손으로 열고 닫을 수 있다", "차량 컵홀더에 들어간다"],
        differentiators: ["세라믹 코팅 내부", "슬림한 600ml 대용량"],
        targetAudience: ["출퇴근 운전자", "커피를 자주 마시는 직장인"],
        buyingPoints: ["2만 원대 가격", "냄새 배임 감소", "대용량"],
        cautions: ["탄산음료 보관은 권장되지 않는다", "식기세척기 사용 가능 여부를 확인해야 한다"],
      },
      contentData: {
        videoPoints: ["얼음이 24시간 뒤에도 남아 있는지 보여주는 타임랩스", "원터치 뚜껑 한 손 사용 장면"],
        blogPoints: ["보온·보냉 시간 표", "세라믹 코팅의 장단점", "세척 방법"],
        keywords: ["진공 텀블러", "세라믹 텀블러", "차량용 텀블러", "대용량 텀블러", "출근 텀블러"],
        hooks: ["텀블러에서 어제 커피 냄새 나시죠?", "아침 얼음이 퇴근까지 남는 텀블러"],
        forbiddenExpressions: ["영구 보온", "세균 100% 차단"],
      },
    },
  },
];

export function findCatalogByTitle(title: string): CatalogEntry | undefined {
  return PRODUCT_CATALOG.find((c) => c.raw.title === title);
}
