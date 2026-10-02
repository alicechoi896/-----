"use client";

import { useState } from "react";
import { Bot, MonitorPlay, Search, ShieldCheck, Sparkles, Wand2 } from "lucide-react";
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
    description: "네이버 검색 트렌드(DataLab) 및 검색 데이터",
    usages: ["네이버 트렌드", "키워드 조사"],
    icon: Search,
    fields: [
      { name: "clientId", label: "Client ID", placeholder: "애플리케이션 Client ID" },
      { name: "clientSecret", label: "Client Secret", placeholder: "애플리케이션 Client Secret" },
    ],
    docsUrl: "https://developers.naver.com/apps/#/register",
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
