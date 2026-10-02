"use client";

import { useState } from "react";
import { Plug, RefreshCw, Unplug, type LucideIcon } from "lucide-react";
import type { ApiConnectionPublic, ProviderId } from "@/lib/types";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { IconChip } from "@/components/ui/IconChip";
import { cardClass } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn, formatRelative } from "@/lib/utils";

export interface ProviderMeta {
  id: ProviderId;
  name: string;
  description: string;
  usages: string[];
  icon: LucideIcon;
  fields: { name: string; label: string; placeholder: string; optional?: boolean; section?: string; hint?: string }[];
  /** 수정할 때 비운 칸은 기존 값 유지 (NAVER 처럼 키가 여러 개인 경우) */
  keepBlank?: boolean;
  docsUrl: string;
}

/**
 * API 연결 카드 (BYOK).
 * 보안: 입력한 Key 는 이 컴포넌트 state 에만 잠시 있고, 서버 전송 후 즉시 비운다.
 * localStorage 등 브라우저 저장소에 저장하지 않는다. 서버는 마스킹 값만 돌려준다.
 */
export function ApiConnectionCard({
  meta,
  connection,
  onChange,
}: {
  meta: ProviderMeta;
  connection: ApiConnectionPublic;
  onChange: (c: ApiConnectionPublic) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"connect" | "test" | "disconnect" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const connected = connection.status !== "disconnected";

  async function run(kind: "connect" | "test" | "disconnect", fn: () => Promise<ApiConnectionPublic>) {
    setBusy(kind);
    setError(null);
    try {
      onChange(await fn());
      if (kind === "connect") {
        setValues({}); // 평문 Key 를 메모리에서 즉시 제거
        setEditing(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={cn(cardClass, "flex flex-col")}>
      <div className="flex items-start justify-between gap-4 p-5">
        <div className="flex items-start gap-3">
          <IconChip icon={meta.icon} accent="neutral" />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[15px] font-semibold text-fg">{meta.name}</h3>
              <StatusBadge status={connection.status} />
            </div>
            <p className="mt-1 text-[13px] text-fg-subtle">{meta.description}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {meta.usages.map((u) => (
                <span key={u} className="text-xs text-fg-muted">
                  #{u}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 border-t border-line px-5 py-4">
        {connected && !editing && (
          <dl className="tabular grid grid-cols-[88px_1fr] gap-y-1.5 text-[13px]">
            <dt className="text-fg-subtle">저장된 키</dt>
            <dd className="font-mono text-fg-muted">{connection.maskedHint}</dd>
            <dt className="text-fg-subtle">최근 테스트</dt>
            <dd className={connection.lastTest ? (connection.lastTest.ok ? "text-success" : "text-danger") : "text-fg-subtle"}>
              {connection.lastTest
                ? `${connection.lastTest.ok ? "성공" : "실패"} · ${formatRelative(connection.lastTest.testedAt)}`
                : "아직 테스트하지 않음"}
            </dd>
          </dl>
        )}
        {connection.lastTest && !editing && <p className="text-xs leading-relaxed text-fg-subtle">{connection.lastTest.message}</p>}

        {(!connected || editing) && (
          <form
            className="grid gap-3"
            autoComplete="off"
            onSubmit={(e) => {
              e.preventDefault();
              run("connect", () => api.connections.connect(meta.id, values));
            }}
          >
            {connected && meta.keepBlank && <p className="text-xs text-fg-subtle">비워 둔 칸은 지금 저장된 값을 그대로 씁니다.</p>}
            {meta.fields.map((f) => (
              <FormField
                key={f.name}
                label={f.section ? `${f.section} · ${f.label}` : f.label}
                htmlFor={`${meta.id}-${f.name}`}
                optional={f.optional}
                hint={f.hint}
              >
                <Input
                  id={`${meta.id}-${f.name}`}
                  type="password"
                  autoComplete="new-password"
                  placeholder={f.placeholder}
                  value={values[f.name] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                />
              </FormField>
            ))}
            <div className="flex items-center gap-2">
              <Button type="submit" variant="primary" size="sm" icon={Plug} loading={busy === "connect"}>
                연결하기
              </Button>
              {editing && (
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  취소
                </Button>
              )}
            </div>
          </form>
        )}

        {error && <p className="text-xs text-danger">{error}</p>}
      </div>

      <footer className="mt-auto flex items-center justify-between gap-2 border-t border-line bg-subtle/60 px-5 py-2.5">
        <a href={meta.docsUrl} target="_blank" rel="noreferrer" className="text-xs text-fg-subtle hover:text-fg">
          키 발급 방법 ↗
        </a>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            icon={RefreshCw}
            disabled={!connected}
            loading={busy === "test"}
            onClick={() => run("test", () => api.connections.test(meta.id))}
          >
            테스트
          </Button>
          {connected && !editing && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                키 변경
              </Button>
              <Button
                size="sm"
                variant="danger"
                icon={Unplug}
                loading={busy === "disconnect"}
                onClick={() => run("disconnect", () => api.connections.disconnect(meta.id))}
              >
                해제
              </Button>
            </>
          )}
        </div>
      </footer>
    </section>
  );
}
