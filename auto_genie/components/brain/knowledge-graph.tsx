"use client";

import { useMemo, useState } from "react";
import { ReactFlow, Background, Controls, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ENTITY_TYPE_LABEL, ENTITY_TYPE_ICON } from "./entity-meta";
import type { Database, EntityType } from "@/types/database";

type Entity = Database["public"]["Tables"]["knowledge_entities"]["Row"];
type Relation = Database["public"]["Tables"]["knowledge_relations"]["Row"];

function EntityNode({ data }: { data: { name: string; type: EntityType; confidence: number } }) {
  const Icon = ENTITY_TYPE_ICON[data.type];
  return (
    <div className="rounded-xl border-2 border-violet-300 bg-white shadow-sm px-3 py-2 w-48">
      <div className="flex items-center gap-1.5 text-violet-600">
        <Icon className="size-3.5" />
        <span className="text-[10px] font-medium uppercase tracking-wide">
          {ENTITY_TYPE_LABEL[data.type]}
        </span>
      </div>
      <p className="mt-1 text-sm font-medium text-neutral-900 truncate">{data.name}</p>
      <div className="mt-1 h-1 w-full rounded-full bg-neutral-100">
        <div
          className="h-1 rounded-full bg-violet-500"
          style={{ width: `${Math.round(data.confidence * 100)}%` }}
        />
      </div>
    </div>
  );
}

const nodeTypes = { entity: EntityNode };

function layoutGraph(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 30, ranksep: 70 });
  nodes.forEach((n) => g.setNode(n.id, { width: 192, height: 70 }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - 96, y: pos.y - 35 } };
  });
}

export function KnowledgeGraph({
  entities,
  relations,
  onSelectEntity,
}: {
  entities: Entity[];
  relations: Relation[];
  onSelectEntity: (entityId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    return entities.filter((e) => {
      if (typeFilter !== "all" && e.entity_type !== typeFilter) return false;
      if (search && !e.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [entities, search, typeFilter]);

  const { nodes, edges } = useMemo(() => {
    const visibleIds = new Set(filtered.map((e) => e.id));
    const rawNodes: Node[] = filtered.map((e) => ({
      id: e.id,
      type: "entity",
      position: { x: 0, y: 0 },
      data: { name: e.name, type: e.entity_type, confidence: e.confidence_score },
    }));
    const rawEdges: Edge[] = relations
      .filter((r) => visibleIds.has(r.source_entity_id) && visibleIds.has(r.target_entity_id))
      .map((r) => ({
        id: r.id,
        source: r.source_entity_id,
        target: r.target_entity_id,
        label: r.relation_type,
        animated: false,
        style: { stroke: "#a78bfa" },
        labelStyle: { fontSize: 10, fill: "#6d28d9" },
      }));
    return { nodes: layoutGraph(rawNodes, rawEdges), edges: rawEdges };
  }, [filtered, relations]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="지식 개체 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="유형 필터" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 유형</SelectItem>
            {Object.entries(ENTITY_TYPE_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {nodes.length === 0 ? (
        <div className="h-[500px] rounded-2xl border border-dashed border-neutral-300 flex items-center justify-center text-neutral-400">
          표시할 지식 개체가 없습니다.
        </div>
      ) : (
        <div className="h-[500px] rounded-2xl border border-neutral-200 bg-neutral-50">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            onNodeClick={(_, node) => onSelectEntity(node.id)}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} color="#e5e5e5" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      )}
    </div>
  );
}
