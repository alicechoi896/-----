"use client";

import { Bot, MonitorPlay, Search, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import { ErrorState, LoadingState, Notice } from "@/components/ui";
import { ApiConnectionCard, type ProviderMeta } from "@/components/shared/ApiConnectionCard";

/** 초기 핵심 Provider 3종. 새 Provider 는 여기와 서버 PROVIDER_IDS 에 함께 추가한다 */
const PROVIDERS: ProviderMeta[] = [
  {
    id: "openai",
    name: "OpenAI",
    description: "글쓰기, 제목·대본·설명 생성, 키워드 해석, 이미지·제품 분석",
    usages: ["글쓰기", "대본", "제품 분석", "이미지 분석"],
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

export function ApiCenter() {
  const { data, loading, error, reload, setData } = useAsync(() => api.connections.list(), []);

  return (
    <div className="space-y-5">
      <Notice tone="info" icon={ShieldCheck} title="API Key 보안 원칙">
        입력한 키는 서버로만 전송되어 암호화(AES-256-GCM)되어 저장됩니다. 브라우저(localStorage 등)에는 저장하지 않으며, 화면에는
        마스킹된 값만 표시됩니다. 현재 Mock 모드에서는 외부 API를 호출하지 않습니다.
      </Notice>

      {loading ? (
        <LoadingState variant="skeleton" rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {PROVIDERS.map((meta) => {
            const connection = data?.find((c) => c.provider === meta.id);
            if (!connection) return null;
            return (
              <ApiConnectionCard
                key={meta.id}
                meta={meta}
                connection={connection}
                onChange={(next) => setData((prev) => prev?.map((c) => (c.provider === next.provider ? next : c)) ?? null)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
