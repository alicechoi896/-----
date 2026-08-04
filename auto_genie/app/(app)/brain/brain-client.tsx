"use client";

import { useMemo, useState, useTransition } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { KnowledgeGraph } from "@/components/brain/knowledge-graph";
import { EvidenceDrawer, type EvidenceItem } from "@/components/brain/evidence-drawer";
import { ENTITY_TYPE_ICON, ENTITY_TYPE_COLOR } from "@/components/brain/entity-meta";
import { editEntityAction, editBrandProfileAction, toggleDecisionRuleAction } from "./actions";
import type { Database, EntityType } from "@/types/database";
import { Pencil, Eye, ArrowRight, Sparkles } from "lucide-react";

type Entity = Database["public"]["Tables"]["knowledge_entities"]["Row"];
type Relation = Database["public"]["Tables"]["knowledge_relations"]["Row"];
type DecisionRule = Database["public"]["Tables"]["decision_rules"]["Row"];
type BrandProfile = Database["public"]["Tables"]["brand_profiles"]["Row"] | null;

export function BrainClient({
  entities,
  relations,
  decisionRules,
  brandProfile,
  evidence,
}: {
  entities: Entity[];
  relations: Relation[];
  decisionRules: DecisionRule[];
  brandProfile: BrandProfile;
  evidence: EvidenceItem[];
}) {
  const [drawerEntity, setDrawerEntity] = useState<Entity | null>(null);
  const evidenceByEntity = useMemo(() => {
    const map = new Map<string, EvidenceItem[]>();
    for (const ev of evidence as (EvidenceItem & { entity_id: string })[]) {
      const list = map.get(ev.entity_id) ?? [];
      list.push(ev);
      map.set(ev.entity_id, list);
    }
    return map;
  }, [evidence]);

  const byType = (type: EntityType) => entities.filter((e) => e.entity_type === type);

  return (
    <div className="p-6 max-w-[1440px] mx-auto space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-violet-600 uppercase">마케팅 브레인</p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-900">
          AI가 구조화한 기업의 마케팅 지식과 의사결정 기준
        </h1>
      </div>

      <Tabs defaultValue="dna">
        <TabsList>
          <TabsTrigger value="dna">기업 DNA</TabsTrigger>
          <TabsTrigger value="problem-map">고객 문제지도</TabsTrigger>
          <TabsTrigger value="expert-map">전문가 사고지도</TabsTrigger>
          <TabsTrigger value="graph">지식그래프</TabsTrigger>
          <TabsTrigger value="rules">의사결정 규칙</TabsTrigger>
        </TabsList>

        <TabsContent value="dna" className="mt-4 space-y-6">
          <CoreMessageCard brandProfile={brandProfile} />
          {(
            [
              ["expertise", "핵심 전문성"],
              ["audience", "핵심 고객"],
              ["customer_problem", "주요 고객 문제"],
              ["solution", "주요 해결책"],
              ["brand_expression", "브랜드 표현"],
              ["prohibited_expression", "금지 표현"],
              ["product", "연결 상품"],
            ] as [EntityType, string][]
          ).map(([type, label]) => (
            <EntitySection
              key={type}
              label={label}
              entities={byType(type)}
              evidenceByEntity={evidenceByEntity}
              onViewEvidence={setDrawerEntity}
            />
          ))}
          {brandProfile?.persuasion_structure && Array.isArray(brandProfile.persuasion_structure) && brandProfile.persuasion_structure.length > 0 && (
            <div>
              <p className="font-medium text-neutral-900 mb-2">설득 구조</p>
              <div className="flex flex-wrap gap-2">
                {(brandProfile.persuasion_structure as string[]).map((s, i) => (
                  <Badge key={i} variant="outline">
                    {i + 1}. {s}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="problem-map" className="mt-4">
          <ProblemMap entities={entities} relations={relations} />
        </TabsContent>

        <TabsContent value="expert-map" className="mt-4">
          <ExpertMap rules={decisionRules} />
        </TabsContent>

        <TabsContent value="graph" className="mt-4">
          <KnowledgeGraph
            entities={entities}
            relations={relations}
            onSelectEntity={(id) => setDrawerEntity(entities.find((e) => e.id === id) ?? null)}
          />
        </TabsContent>

        <TabsContent value="rules" className="mt-4">
          <RulesTable rules={decisionRules} />
        </TabsContent>
      </Tabs>

      <EvidenceDrawer
        open={!!drawerEntity}
        onOpenChange={(open) => !open && setDrawerEntity(null)}
        title={drawerEntity?.name ?? ""}
        confidence={drawerEntity?.confidence_score}
        evidence={drawerEntity ? evidenceByEntity.get(drawerEntity.id) ?? [] : []}
      />
    </div>
  );
}

function CoreMessageCard({ brandProfile }: { brandProfile: BrandProfile }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(brandProfile?.core_message ?? "");
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-5">
      <div className="flex items-center justify-between">
        <p className="font-medium text-neutral-900">대표 메시지</p>
        <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
          <Pencil className="size-3.5" /> {editing ? "취소" : "수정"}
        </Button>
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <Textarea value={value} onChange={(e) => setValue(e.target.value)} rows={2} />
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const fd = new FormData();
                fd.set("field", "core_message");
                fd.set("value", value);
                await editBrandProfileAction(fd);
                setEditing(false);
              })
            }
          >
            저장
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-neutral-700">
          {brandProfile?.core_message || "아직 AI가 대표 메시지를 추출하지 못했습니다."}
        </p>
      )}
    </div>
  );
}

function EntitySection({
  label,
  entities,
  evidenceByEntity,
  onViewEvidence,
}: {
  label: string;
  entities: Entity[];
  evidenceByEntity: Map<string, EvidenceItem[]>;
  onViewEvidence: (entity: Entity) => void;
}) {
  if (entities.length === 0) return null;
  return (
    <div>
      <p className="font-medium text-neutral-900 mb-2">{label}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {entities.map((entity) => (
          <EntityCard
            key={entity.id}
            entity={entity}
            evidenceCount={evidenceByEntity.get(entity.id)?.length ?? 0}
            onViewEvidence={() => onViewEvidence(entity)}
          />
        ))}
      </div>
    </div>
  );
}

function EntityCard({
  entity,
  evidenceCount,
  onViewEvidence,
}: {
  entity: Entity;
  evidenceCount: number;
  onViewEvidence: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(entity.summary ?? "");
  const [pending, startTransition] = useTransition();
  const Icon = ENTITY_TYPE_ICON[entity.entity_type];

  return (
    <div className={`rounded-xl border p-3 ${ENTITY_TYPE_COLOR[entity.entity_type]} bg-opacity-30`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className="size-3.5" />
          <p className="font-medium text-neutral-900 text-sm">{entity.name}</p>
        </div>
        <Badge variant="outline" className="text-[10px] bg-white">
          {Math.round(entity.confidence_score * 100)}%
        </Badge>
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <Textarea value={value} onChange={(e) => setValue(e.target.value)} rows={3} className="bg-white" />
          <div className="flex gap-1.5">
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const fd = new FormData();
                  fd.set("entityId", entity.id);
                  fd.set("summary", value);
                  await editEntityAction(fd);
                  setEditing(false);
                })
              }
            >
              저장
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              취소
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-1.5 text-xs text-neutral-600 line-clamp-3">{entity.summary}</p>
      )}
      <div className="mt-2 flex items-center gap-1">
        <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={onViewEvidence}>
          <Eye className="size-3" /> 근거 {evidenceCount}건
        </Button>
        {!editing && (
          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={() => setEditing(true)}>
            <Pencil className="size-3" /> 수정
          </Button>
        )}
      </div>
    </div>
  );
}

function ProblemMap({ entities, relations }: { entities: Entity[]; relations: Relation[] }) {
  const problems = entities.filter((e) => e.entity_type === "customer_problem");

  if (problems.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center text-neutral-400">
        아직 추출된 고객 문제가 없습니다. AI 학습센터에서 고객 질문/후기/상담 기록을 등록하세요.
      </div>
    );
  }

  const findRelated = (entityId: string, type: EntityType, excludeId?: string) => {
    const relatedIds = relations
      .filter((r) => r.source_entity_id === entityId || r.target_entity_id === entityId)
      .map((r) => (r.source_entity_id === entityId ? r.target_entity_id : r.source_entity_id));
    return entities.find(
      (e) => relatedIds.includes(e.id) && e.entity_type === type && e.id !== excludeId
    );
  };

  const stages: [string, EntityType][] = [
    ["원인", "customer_problem"],
    ["숨은 욕구", "desire"],
    ["구매 장벽", "objection"],
    ["해결 방법", "solution"],
    ["연결 상품", "product"],
    ["추천 콘텐츠", "content_pattern"],
  ];

  return (
    <div className="space-y-4">
      {problems.map((problem) => (
        <div key={problem.id} className="rounded-2xl border border-neutral-200 bg-white p-4 overflow-x-auto">
          <div className="flex items-center gap-2 flex-nowrap min-w-max">
            <StageChip label="표면 문제" value={problem.name} highlight />
            {stages.map(([label, type]) => {
              const related = findRelated(problem.id, type, problem.id);
              return (
                <div key={label} className="flex items-center gap-2">
                  <ArrowRight className="size-4 text-neutral-300 shrink-0" />
                  <StageChip label={label} value={related?.name ?? "-"} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function StageChip({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 w-40 shrink-0 ${
        highlight ? "border-orange-300 bg-orange-50" : "border-neutral-200 bg-neutral-50"
      }`}
    >
      <p className="text-[10px] uppercase tracking-wide text-neutral-400">{label}</p>
      <p className="text-sm font-medium text-neutral-900 truncate">{value}</p>
    </div>
  );
}

function ExpertMap({ rules }: { rules: DecisionRule[] }) {
  const active = rules.filter((r) => r.is_active);
  if (active.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center text-neutral-400">
        아직 추출된 의사결정 규칙이 없습니다.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {active.map((rule) => (
        <div key={rule.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
          <div className="flex items-center gap-1.5 text-violet-600">
            <Sparkles className="size-3.5" />
            <p className="text-xs font-medium">{rule.rule_name}</p>
          </div>
          <p className="mt-2 text-sm">
            <span className="font-semibold text-sky-600">IF</span> {rule.condition_text}
          </p>
          <p className="mt-1 text-sm">
            <span className="font-semibold text-violet-600">THEN</span> {rule.action_text}
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            <span className="font-semibold">BECAUSE</span> {rule.reason_text}
          </p>
          <div className="mt-2 flex gap-1.5">
            <Badge variant="outline" className="text-[10px]">
              {rule.rule_category}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              가중치 {rule.weight.toFixed(2)}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              신뢰도 {Math.round(rule.confidence_score * 100)}%
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

function RulesTable({ rules }: { rules: DecisionRule[] }) {
  const [, startTransition] = useTransition();
  if (rules.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center text-neutral-400">
        아직 저장된 의사결정 규칙이 없습니다.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white divide-y">
      {rules.map((rule) => (
        <div key={rule.id} className="p-4 flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-neutral-900">{rule.rule_name}</p>
            <p className="text-sm text-neutral-500 mt-0.5">
              IF {rule.condition_text} → THEN {rule.action_text}
            </p>
            <div className="mt-1.5 flex gap-1.5">
              <Badge variant="outline" className="text-[10px]">
                {rule.rule_category}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                신뢰도 {Math.round(rule.confidence_score * 100)}%
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-neutral-400">{rule.is_active ? "활성" : "비활성"}</span>
            <Switch
              checked={rule.is_active}
              onCheckedChange={(checked) =>
                startTransition(() => toggleDecisionRuleAction(rule.id, checked))
              }
            />
          </div>
        </div>
      ))}
    </div>
  );
}
