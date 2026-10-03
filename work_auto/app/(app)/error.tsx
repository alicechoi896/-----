"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { reportClientError } from "@/components/layout/ErrorReporter";
import { Button } from "@/components/ui";

/** 화면을 그리다 오류가 나면 이 안내를 보여 주고, 오류 기록으로 보낸다 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error, error.digest ? `digest ${error.digest}` : "화면 그리기");
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-32 text-center">
      <p className="text-sm font-medium text-fg">화면을 표시하는 중 문제가 생겼습니다</p>
      <p className="mt-1 text-[13px] leading-relaxed text-fg-subtle">관리자에게 오류가 자동으로 기록되었습니다. 다시 시도하거나 잠시 후 새로고침해 주세요.</p>
      <Button className="mt-4" icon={RotateCcw} onClick={reset}>
        다시 시도
      </Button>
    </div>
  );
}
