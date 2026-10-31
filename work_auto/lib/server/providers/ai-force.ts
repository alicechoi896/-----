import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * AI 고정 (v0.9.119) — 특정 작업은 설정(기본 AI)과 상관없이 정해진 AI 로.
 * YouTube 제품 홍보 영상 원고(제목·Hook·CTA·대본·설명·태그)와 새벽 제품 영상 자동 제작의 글 작업은 Claude 로 고정 (사용자 결정).
 * 그 실행 흐름 안에서만 적용되고, 다른 기능은 설정 › 기본 AI 그대로.
 */
const als = new AsyncLocalStorage<"claude">();
export const forcedAi = () => als.getStore() ?? null;
export const withClaude = <T,>(fn: () => Promise<T>): Promise<T> => als.run("claude", fn);
/** Claude 로 고정하는 생성 기능 */
export const CLAUDE_ONLY_FEATURES = new Set(["yt-product-video"]);
