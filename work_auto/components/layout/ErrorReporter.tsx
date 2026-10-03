"use client";

import { useEffect } from "react";
import { api } from "@/lib/api-client";

/**
 * 화면(브라우저) 오류를 서버의 오류 기록으로 보낸다 (관리자 › 오류 기록).
 * 같은 오류는 한 번만, 한 화면에서 최대 10건. 보내기에 실패해도 조용히 넘어간다.
 */
const sent = new Set<string>();
const MAX_PER_PAGE = 10;

export function reportClientError(error: unknown, extra?: string) {
  const e = error instanceof Error ? error : null;
  const message = `${e?.message ?? String(error ?? "알 수 없는 화면 오류")}${extra ? ` (${extra})` : ""}`.slice(0, 1000);
  const key = message.slice(0, 200);
  // 브라우저 확장·광고 차단기 등 우리 코드가 아닌 곳에서 난 흔한 오류는 보내지 않는다
  if (sent.has(key) || sent.size >= MAX_PER_PAGE || /ResizeObserver loop|Script error\.?$|chrome-extension:\/\//.test(message)) return;
  sent.add(key);
  void api.errors.report({ message, stack: e?.stack?.slice(0, 6000), path: window.location.pathname }).catch(() => undefined);
}

export function ErrorReporter() {
  useEffect(() => {
    const onError = (ev: ErrorEvent) => reportClientError(ev.error ?? ev.message);
    const onRejection = (ev: PromiseRejectionEvent) => reportClientError(ev.reason, "처리되지 않은 Promise");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
