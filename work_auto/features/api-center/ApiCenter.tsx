"use client";

import { useState } from "react";
import { BarChart3, Bot, Film, MonitorPlay, Search, ShieldCheck, Sparkles, Wand2 } from "lucide-react";
import type { AiProviderId, ApiConnectionPublic } from "@/lib/types";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import { ErrorState, LoadingState, Notice, SectionCard, SegmentedControl } from "@/components/ui";
import { ApiConnectionCard, type ProviderMeta } from "@/components/shared/ApiConnectionCard";

/** Provider 카드 정의. 새 Provider 는 여기와 서버 PROVIDER_IDS 에 함께 추가한다 */
const PROVIDERS: ProviderMeta[] = [
  {
    id: "claude",
    name: "Claude (Anthropic)",
    description: "글쓰기, 제목·대본·설명 생성, 상세페이지 이미지 읽기, 제품 분석 (기본 모델: Claude Sonnet 5.5)",
    usages: ["글쓰기", "대본", "이미지 읽기", "제품 분석"],
    icon: Sparkles,
    fields: [{ name: "apiKey", label: "API Key", placeholder: "sk-ant-…" }],
    docsUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "글쓰기, 제목·대본·설명 생성, 이미지 읽기, 제품 분석",
    usages: ["글쓰기", "대본", "이미지 읽기", "제품 분석"],
    icon: Bot,
    fields: [{ name: "apiKey", label: "API Key", placeholder: "sk-…" }],
    docsUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "youtube",
    name: "YouTube Data API",
    description: "YouTube 영상, 채널, 조회수 데이터 수집",
    usages: ["트렌드 찾기", "영상 URL 가져오기"],
    icon: MonitorPlay,
    fields: [{ name: "apiKey", label: "API Key", placeholder: "AIza…" }],
    docsUrl: "https://developers.google.com/youtube/v3/getting-started",
  },
  {
    id: "naver",
    name: "NAVER API",
    description: "검색 추이(데이터랩)·블로그 문서 수(검색 API)",
    usages: ["네이버 트렌드", "키워드 조사", "블로그 문서 수"],
    icon: Search,
    keepBlank: true,
    fields: [
      { name: "clientId", label: "Client ID", placeholder: "애플리케이션 Client ID", hint: "developers.naver.com → 내 애플리케이션. 사용 API 에 '데이터랩(검색어트렌드)'와 '검색' 추가" },
      { name: "clientSecret", label: "Client Secret", placeholder: "애플리케이션 Client Secret" },
    ],
    docsUrl: "https://developers.naver.com/apps/#/register",
  },
  {
    id: "naver-searchad",
    name: "NAVER 검색광고 API",
    description: "키워드의 월간 검색량(PC·모바일)·연관 키워드·경쟁도. 위 NAVER API 와 함께 연결하면 네이버 트렌드·키워드 조사에 숫자가 붙습니다 (선택)",
    usages: ["월간 검색량", "연관 키워드", "경쟁도"],
    icon: BarChart3,
    fields: [
      { name: "apiKey", label: "엑세스라이선스", placeholder: "0100000000…", hint: "searchad.naver.com → 도구 → API 사용 관리 (광고비 없이 무료 발급)" },
      { name: "secretKey", label: "비밀키", placeholder: "AQAAAA…" },
      { name: "customerId", label: "CUSTOMER_ID", placeholder: "숫자 (예: 1234567)" },
    ],
    docsUrl: "https://searchad.naver.com",
  },
  {
    id: "tikhub",
    name: "TikHub",
    description: "샤오홍슈·도우인 영상 검색과 도우인 링크 가져오기·다운로드 (영상 URL 가져오기 › 영상 검색). 검색 1회 약 $0.01 · 도우인 링크 1회 약 $0.001 · [테스트]는 무료(계정 정보 확인)",
    usages: ["샤오홍슈·도우인 영상 검색", "도우인 링크 가져오기·다운로드"],
    icon: Film,
    fields: [{ name: "apiKey", label: "API Key", placeholder: "TikHub API Key", hint: "tikhub.io → 대시보드 → API Keys. 키는 서버에만 암호화해 저장합니다" }],
    docsUrl: "https://user.tikhub.io",
  },
];

const AI_LABEL: Record<AiProviderId, string> = { claude: "Claude", openai: "OpenAI" };

export function ApiCenter() {
  const { data, loading, error, reload, setData } = useAsync(() => api.connections.list(), []);
  const settings = useAsync(() => api.settings.get(), []);
  const [saving, setSaving] = useState(false);

  const connected = (id: AiProviderId) => data?.find((c) => c.provider === id && c.status !== "disconnected");
  const aiOptions = (["claude", "openai"] as AiProviderId[]).filter((id) => connected(id));
  const current: AiProviderId | null = settings.data?.preferredAi && connected(settings.data.preferredAi) ? settings.data.preferredAi : (aiOptions[0] ?? null);

  async function choose(id: AiProviderId) {
    setSaving(true);
    try {
      const next = await api.settings.update({ preferredAi: id });
      settings.setData(() => next);
    } finally {
      setSaving(false);
    }
  }

  function replace(next: ApiConnectionPublic) {
    setData((prev) => prev?.map((c) => (c.provider === next.provider ? next : c)) ?? null);
  }

  return (
    <div className="space-y-5">
      <Notice tone="info" icon={ShieldCheck} title="API Key 보안 원칙">
        입력한 키는 서버로만 전송되어 암호화(AES-256-GCM)되어 저장됩니다. 브라우저(localStorage 등)에는 저장하지 않으며, 화면에는
        마스킹된 값만 표시됩니다. 사용 요금은 각 키의 계정으로 청구됩니다.
      </Notice>

      <SectionCard
        title="기본 AI"
        icon={Wand2}
        description="글쓰기·제품 분석·이미지 읽기에 사용할 AI 입니다. 두 개를 모두 연결했을 때 여기서 고릅니다."
      >
        {loading || settings.loading ? (
          <LoadingState variant="skeleton" rows={1} />
        ) : aiOptions.length === 0 ? (
          <p className="text-sm text-fg-subtle">
            연결된 AI 가 없습니다. 아래에서 Claude 또는 OpenAI 를 연결하세요. 연결 전까지는 예시(Mock) 문장이 만들어집니다.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl
              value={current ?? aiOptions[0]}
              onChange={(v) => choose(v as AiProviderId)}
              options={aiOptions.map((id) => ({ value: id, label: AI_LABEL[id] }))}
            />
            <span className="text-xs text-fg-subtle">{saving ? "저장 중…" : `현재: ${current ? AI_LABEL[current] : "-"}`}</span>
          </div>
        )}
      </SectionCard>

      {loading ? (
        <LoadingState variant="skeleton" rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {PROVIDERS.map((meta) => {
            const connection = data?.find((c) => c.provider === meta.id);
            if (!connection) return null;
            return <ApiConnectionCard key={meta.id} meta={meta} connection={connection} onChange={replace} />;
          })}
        </div>
      )}
    </div>
  );
}
