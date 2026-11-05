"use client";

import { useRouter } from "next/navigation";
import { ScanSearch, TrendingUp } from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";
import { ReelRead } from "@/features/reel-read/ReelRead";
import { InstagramTrendExplorer } from "./InstagramTrendExplorer";

/** v0.9.180 인스타그램 트렌드 찾기 안에 [릴스 읽기] 탭 (예전 공통 도구 › 릴스 읽기 페이지를 옮김) */
export function InstagramTrendTabs({ initialTab }: { initialTab: "find" | "read" }) {
  const router = useRouter();
  return (
    <div className="space-y-5">
      <Tabs
        value={initialTab}
        onChange={(v) => router.replace(v === "read" ? "/instagram/trends?tab=read" : "/instagram/trends", { scroll: false })}
        items={[
          { value: "find", label: "트렌드 찾기", icon: TrendingUp },
          { value: "read", label: "릴스 읽기 (받아쓰기·장면 분석)", icon: ScanSearch },
        ]}
      />
      {initialTab === "read" ? <ReelRead /> : <InstagramTrendExplorer />}
    </div>
  );
}
