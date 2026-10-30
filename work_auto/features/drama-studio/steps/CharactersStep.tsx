"use client";

import { useState } from "react";
import { Network, Plus, RefreshCw, Sparkles, Trash2, Users } from "lucide-react";
import { Badge, Button, EmptyState, IconButton, Input, SectionCard, Select } from "@/components/ui";
import { MAX_CHARACTERS, newId } from "@/lib/drama-studio/steps";
import type { DramaCharacter } from "@/lib/drama-studio/types";
import { cn } from "@/lib/utils";
import { studioApi } from "../api";
import { TextField } from "../ui";
import type { ProjectCtl } from "../useProject";

const ROLES = ["주인공", "적대자", "조력자", "조연", "기타"];
const FIELDS: { k: keyof DramaCharacter; label: string; rows: number }[] = [
  { k: "appearance", label: "외모 특징", rows: 2 },
  { k: "appearanceEn", label: "이미지용 영어 외모 묘사 (캐릭터 시트·스토리보드 프롬프트에 씀)", rows: 2 },
  { k: "outfit", label: "의상", rows: 1 },
  { k: "personality", label: "성격", rows: 2 },
  { k: "desire", label: "욕망과 목표", rows: 2 },
  { k: "weakness", label: "약점", rows: 1 },
  { k: "secret", label: "숨겨진 비밀", rows: 2 },
  { k: "conflict", label: "주요 갈등", rows: 2 },
  { k: "arc", label: "극 중 변화", rows: 2 },
  { k: "speech", label: "말투와 대화 특징", rows: 1 },
];

export const blankCharacter = (): DramaCharacter => ({ id: newId("c"), name: "", role: "조연", age: "", gender: "", appearance: "", appearanceEn: "", outfit: "", personality: "", desire: "", weakness: "", secret: "", conflict: "", relations: [], arc: "", speech: "" });

/** 04 등장인물: 자동 생성·추가·수정·개별 재생성·삭제·관계도. 인물은 내부 ID(c_…)로 장면·이미지와 잇는다 */
export function CharactersStep({ ctl }: { ctl: ProjectCtl }) {
  const p = ctl.project!;
  const list = p.characters;
  const [openId, setOpenId] = useState<string | null>(list[0]?.id ?? null);
  const set = (id: string, patch: Partial<DramaCharacter>) => ctl.edit("characters", list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const name = (id: string) => list.find((c) => c.id === id)?.name || "(이름 없음)";
  const gen = () => void ctl.run("인물 생성", () => studioApi.generate(p.id, "characters"));
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <SectionCard
        title={`등장인물 · ${list.length}명`}
        icon={Users}
        actions={
          <span className="flex gap-1.5">
            <Button size="sm" variant="ghost" icon={Sparkles} disabled={Boolean(ctl.busy)} loading={ctl.busy === "인물 생성"} onClick={gen} data-gen-characters>
              {list.length ? "전체 다시 생성" : "자동 생성 (AI 1회)"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={Plus}
              disabled={list.length >= MAX_CHARACTERS}
              onClick={() => {
                const c = blankCharacter();
                ctl.edit("characters", [...list, c]);
                setOpenId(c.id);
              }}
            >
              인물 추가
            </Button>
          </span>
        }
      >
        {!list.length ? (
          <EmptyState icon={Users} title="등장인물이 없습니다" description="[자동 생성]으로 로그라인에 맞는 인물을 만들거나 직접 추가해 주세요. 인원 제한은 없습니다 (최대 12명)." className="py-12" />
        ) : (
          <ul className="space-y-2" data-characters>
            {list.map((c) => (
              <li key={c.id} className={cn("rounded-control border", openId === c.id ? "border-brand" : "border-line")} data-character={c.id}>
                <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <Input value={c.name} onChange={(e) => set(c.id, { name: e.target.value })} placeholder="이름" className="h-8 w-28 font-semibold" aria-label="이름" />
                  <Select value={ROLES.includes(c.role) ? c.role : "기타"} options={ROLES.map((r) => ({ value: r, label: r }))} onChange={(e) => set(c.id, { role: e.target.value })} aria-label="역할" className="h-8 w-28" />
                  <Input value={c.age} onChange={(e) => set(c.id, { age: e.target.value })} placeholder="나이" className="h-8 w-20" aria-label="나이" />
                  <Input value={c.gender} onChange={(e) => set(c.id, { gender: e.target.value })} placeholder="성별" className="h-8 w-20" aria-label="성별" />
                  <span className="font-mono text-[10.5px] text-fg-subtle">{c.id}</span>
                  <span className="ml-auto flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setOpenId(openId === c.id ? null : c.id)}>
                      {openId === c.id ? "접기" : "자세히"}
                    </Button>
                    <IconButton icon={RefreshCw} label="이 인물 다시 생성" disabled={Boolean(ctl.busy)} onClick={() => void ctl.run("인물 다시 생성", () => studioApi.generate(p.id, "character-one", { charId: c.id }))} />
                    <IconButton
                      icon={Trash2}
                      label="삭제"
                      onClick={() => {
                        if (!window.confirm(`${c.name || "이 인물"}을(를) 지울까요? 장면·이미지 연결도 풀립니다.`)) return;
                        ctl.edit("characters", list.filter((x) => x.id !== c.id).map((x) => ({ ...x, relations: x.relations.filter((r) => r.targetId !== c.id) })));
                      }}
                    />
                  </span>
                </div>
                {openId === c.id && (
                  <div className="grid gap-2.5 border-t border-line p-3 md:grid-cols-2">
                    {FIELDS.map((f) => (
                      <TextField key={f.k} label={f.label} rows={f.rows > 1 ? f.rows : 0} value={String(c[f.k] ?? "")} onChange={(v) => set(c.id, { [f.k]: v })} className={f.k === "appearanceEn" ? "md:col-span-2" : ""} />
                    ))}
                    <div className="space-y-1.5 md:col-span-2">
                      <span className="text-[12px] font-medium text-fg-muted">다른 인물과의 관계</span>
                      {c.relations.map((r, k) => (
                        <div key={k} className="flex gap-1.5">
                          <Select value={r.targetId} options={list.filter((x) => x.id !== c.id).map((x) => ({ value: x.id, label: x.name || x.id }))} onChange={(e) => set(c.id, { relations: c.relations.map((y, j) => (j === k ? { ...y, targetId: e.target.value } : y)) })} className="h-8 w-36" aria-label="관계 대상" />
                          <Input value={r.relation} onChange={(e) => set(c.id, { relations: c.relations.map((y, j) => (j === k ? { ...y, relation: e.target.value } : y)) })} className="h-8 flex-1" placeholder="관계 (예: 전 연인, 숨기는 비밀이 있음)" aria-label="관계" />
                          <IconButton icon={Trash2} label="관계 삭제" onClick={() => set(c.id, { relations: c.relations.filter((_, j) => j !== k) })} />
                        </div>
                      ))}
                      <Button size="sm" variant="ghost" icon={Plus} disabled={list.length < 2} onClick={() => set(c.id, { relations: [...c.relations, { targetId: list.find((x) => x.id !== c.id)!.id, relation: "" }] })}>
                        관계 추가
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <SectionCard title="관계도" icon={Network}>
        {list.every((c) => !c.relations.length) ? (
          <p className="text-[13px] text-fg-subtle">관계를 넣으면 여기 정리됩니다.</p>
        ) : (
          <ul className="space-y-1.5 text-[13px]" data-relations>
            {list.flatMap((c) =>
              c.relations.map((r, k) => (
                <li key={`${c.id}-${k}`} className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="brand">{c.name || "?"}</Badge>
                  <span className="text-fg-subtle">→</span>
                  <Badge>{name(r.targetId)}</Badge>
                  <span className="text-fg-muted">{r.relation}</span>
                </li>
              )),
            )}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
