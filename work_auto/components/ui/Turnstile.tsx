"use client";

import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile (무료 캡차). form 안에 두면 통과 시 `cf-turnstile-response` 값이 함께 제출된다.
 * 토큰은 한 번만 쓸 수 있으므로 resetKey 가 바뀌면(= 폼을 다시 제출하면) 새로 그린다.
 */
declare global {
  interface Window {
    turnstile?: {
      render(el: HTMLElement, opts: Record<string, unknown>): string;
      remove(id: string): void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

let loading: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SCRIPT_SRC;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        loading = null;
        reject(new Error("turnstile load failed"));
      };
      document.head.appendChild(s);
    });
  }
  return loading;
}

export function Turnstile({ resetKey }: { resetKey?: unknown }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let id: string | undefined;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        id = window.turnstile.render(ref.current, { sitekey: TURNSTILE_SITE_KEY, language: "ko", theme: "light" });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [resetKey]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={ref} className="flex min-h-[65px] justify-center" />;
}
