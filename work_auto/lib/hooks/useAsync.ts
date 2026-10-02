"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** 같은 조건으로 다시 불러오기 */
  reload: () => void;
  /** 서버 응답 없이 로컬 데이터를 고칠 때 (낙관적 업데이트) */
  setData: (updater: (prev: T | null) => T | null) => void;
}

/**
 * 비동기 데이터 로딩 훅. 화면은 loading / error / data 세 상태를 모두 처리한다.
 * deps 가 바뀌면 다시 불러오고, 늦게 도착한 이전 응답은 무시한다.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const requestId = useRef(0);
  const fnRef = useRef(fn);

  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    const id = ++requestId.current;
    let active = true;
    // 첫 렌더의 loading 은 초기값(true) 이고, 이후 재요청은 비동기 콜백 안에서 상태를 바꾼다
    Promise.resolve()
      .then(() => {
        if (!active) return;
        setLoading(true);
        setError(null);
        return fnRef.current();
      })
      .then((result) => {
        if (active && id === requestId.current && result !== undefined) setDataState(result);
      })
      .catch((e: unknown) => {
        if (active && id === requestId.current) setError(e instanceof Error ? e.message : "알 수 없는 오류");
      })
      .finally(() => {
        if (active && id === requestId.current) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback((updater: (prev: T | null) => T | null) => setDataState(updater), []);

  return { data, error, loading, reload, setData };
}
