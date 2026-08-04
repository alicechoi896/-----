"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  INITIAL_RULE_ROWS,
  STATIC_BRAIN_HISTORY,
  type RuleUpdateRow,
  type BrainHistoryEntry,
} from "./rule-update-data";

/**
 * Shared client-side mock state for the demo-only "AI 브레인 버전" narrative
 * (reference analysis -> rule update -> brain history). Nothing here touches
 * Supabase — it's pure UI state, persisted to localStorage only so it
 * survives navigation between pages within the same browser session, per
 * the "화면 간 유지" requirement. Never used as a source of truth for the
 * real pipeline (learning/brain/strategy/orchestrator/performance).
 */

const STORAGE_KEY = "jini-demo-brain-state-v1";

type RuleStatus = "반영 예정" | "반영 완료";

interface PersistedState {
  ruleUpdateApplied: boolean;
  referenceAnalysisApplied: boolean;
  ruleAppliedAt: string | null;
  referenceAppliedAt: string | null;
}

interface DemoBrainContextValue {
  ruleRows: (RuleUpdateRow & { status: RuleStatus })[];
  currentVersion: string;
  pendingVersion: string;
  learningStatus: "검토 대기" | "반영 완료";
  ruleUpdateApplied: boolean;
  ruleAppliedAt: string | null;
  referenceAnalysisApplied: boolean;
  referenceAppliedAt: string | null;
  history: BrainHistoryEntry[];
  applyRuleUpdate: () => void;
  applyReferenceAnalysis: () => void;
  resetDemo: () => void;
}

const DemoBrainContext = createContext<DemoBrainContextValue | null>(null);

const DEFAULT_STATE: PersistedState = {
  ruleUpdateApplied: false,
  referenceAnalysisApplied: false,
  ruleAppliedAt: null,
  referenceAppliedAt: null,
};

export function DemoBrainStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PersistedState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // One-time hydration from localStorage on mount (client-only external
    // system read, per https://react.dev/learn/you-might-not-need-an-effect
    // "subscribing to an external store") — intentionally not derivable from
    // props/state, so this effect legitimately needs its own setState call.
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setState({ ...DEFAULT_STATE, ...JSON.parse(raw) });
    } catch {
      // localStorage unavailable (e.g. private mode) — fall back to defaults silently
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore write failures
    }
  }, [state, hydrated]);

  const applyRuleUpdate = useCallback(() => {
    setState((prev) => ({ ...prev, ruleUpdateApplied: true, ruleAppliedAt: new Date().toISOString() }));
  }, []);

  const applyReferenceAnalysis = useCallback(() => {
    setState((prev) => ({
      ...prev,
      referenceAnalysisApplied: true,
      referenceAppliedAt: new Date().toISOString(),
    }));
  }, []);

  const resetDemo = useCallback(() => setState(DEFAULT_STATE), []);

  const ruleRows = INITIAL_RULE_ROWS.map((row) => ({
    ...row,
    status: (state.ruleUpdateApplied ? "반영 완료" : "반영 예정") as RuleStatus,
  }));

  const history: BrainHistoryEntry[] = [...STATIC_BRAIN_HISTORY];
  if (state.ruleUpdateApplied) {
    history.push({
      version: "v1.4",
      title: "최근 90일 성과 반영",
      changes: ["최근 90일 성과 반영", "콘텐츠 요소 가중치 6개 변경", "쇼츠 권장 길이 조정"],
      reflectedData: ["분석 콘텐츠 58건", "분석 플랫폼 4개"],
      weightChanges: INITIAL_RULE_ROWS.map((r) => ({ element: r.element, before: r.oldWeight, after: r.newWeight })),
      reason: "최근 90일 콘텐츠 성과 분석 결과에 따른 생성 규칙 가중치 조정",
      approver: "워크스페이스 소유자",
      reflectedAt: state.ruleAppliedAt ?? new Date().toISOString(),
      contentComparison: "노하우 나열형 대신 문제 진단형 구조, 직접 구매 대신 상담 CTA가 기본으로 생성됨",
    });
  }

  const value: DemoBrainContextValue = {
    ruleRows,
    currentVersion: state.ruleUpdateApplied ? "v1.4" : "v1.3",
    pendingVersion: "v1.4",
    learningStatus: state.ruleUpdateApplied ? "반영 완료" : "검토 대기",
    ruleUpdateApplied: state.ruleUpdateApplied,
    ruleAppliedAt: state.ruleAppliedAt,
    referenceAnalysisApplied: state.referenceAnalysisApplied,
    referenceAppliedAt: state.referenceAppliedAt,
    history,
    applyRuleUpdate,
    applyReferenceAnalysis,
    resetDemo,
  };

  return <DemoBrainContext.Provider value={value}>{children}</DemoBrainContext.Provider>;
}

export function useDemoBrainStore(): DemoBrainContextValue {
  const ctx = useContext(DemoBrainContext);
  if (!ctx) {
    throw new Error("useDemoBrainStore must be used within DemoBrainStoreProvider");
  }
  return ctx;
}
