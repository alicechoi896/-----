import type { Metadata } from "next";
import { TestFlow } from "@/components/TestFlow";

export const metadata: Metadata = {
  title: "테스트 진행 중 - 나의 MBTI 찾기",
};

export default function TestPage() {
  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col">
      <TestFlow />
    </main>
  );
}
