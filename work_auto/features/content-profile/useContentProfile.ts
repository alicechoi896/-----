"use client";

import { useCallback, useEffect, useState } from "react";
import type { ContentProfile } from "@/lib/types";
import { api } from "@/lib/api-client";

/** 프로필이 여러 개일 때 마지막으로 고른 것 (이 브라우저에서만 기억하는 화면 편의 기능) */
const STORAGE_KEY = "work_auto.trend-profile";

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(id: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // 저장소를 쓸 수 없으면 기억하지 않는다
  }
}

/** 사용 중인 프로필 중 적용할 것: 이 브라우저에서 고른 것 → 기본 프로필 → 첫 번째 */
export function pickProfile(profiles: ContentProfile[]): ContentProfile | null {
  const active = profiles.filter((p) => p.isActive);
  const stored = typeof window === "undefined" ? null : readStored();
  return active.find((p) => p.id === stored) ?? active.find((p) => p.isDefault) ?? active[0] ?? null;
}

export interface ContentProfileState {
  ready: boolean;
  /** 사용 중인 프로필 (전환 목록) */
  profiles: ContentProfile[];
  selected: ContentProfile | null;
  select: (id: string) => void;
  /** 이번 조회에 프로필 범위를 적용할지 */
  applied: boolean;
  setApplied: (v: boolean) => void;
  /** 트렌드 API 에 넘길 값: 프로필 ID, 끈 경우 "none" */
  scopeParam: string;
}

/**
 * 트렌드 화면 공용: 콘텐츠 프로필 자동 적용.
 * 프로필이 1개면 그대로 쓰고, 2개 이상일 때만 전환 UI 가 보인다 (ProfileBar).
 */
export function useContentProfile(onChange?: (profile: ContentProfile | null, scopeParam: string) => void): ContentProfileState {
  const [profiles, setProfiles] = useState<ContentProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [applied, setApplied] = useState(true);

  useEffect(() => {
    let active = true;
    api.profiles
      .list()
      .catch(() => [] as ContentProfile[])
      .then((list) => {
        if (!active) return;
        setProfiles(list.filter((p) => p.isActive));
        setSelectedId(pickProfile(list)?.id ?? null);
        setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const selected = profiles.find((p) => p.id === selectedId) ?? null;

  const select = useCallback(
    (id: string) => {
      setSelectedId(id);
      writeStored(id);
      const next = profiles.find((p) => p.id === id) ?? null;
      onChange?.(next, applied && next ? next.id : "none");
    },
    [profiles, onChange, applied],
  );

  const toggleApplied = useCallback(
    (v: boolean) => {
      setApplied(v);
      onChange?.(selected, v && selected ? selected.id : "none");
    },
    [onChange, selected],
  );

  return {
    ready,
    profiles,
    selected,
    select,
    applied,
    setApplied: toggleApplied,
    scopeParam: !ready ? "" : applied && selected ? selected.id : "none",
  };
}
