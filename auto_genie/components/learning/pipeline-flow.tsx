"use client";

import { useMemo } from "react";
import { ReactFlow, Background, type Node, type Edge, Position } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

export interface PipelineSummary {
  sourceCount: number;
  extractedCount: number;
  chunkedSourceCount: number;
  embeddedChunkCount: number;
  entityCount: number;
  relationCount: number;
  ruleCount: number;
  failedCount: number;
  latestCompletedAt: string | null;
}

function StageNode({ data }: { data: { label: string; count: number; hasError: boolean; description: string } }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white shadow-sm px-4 py-3 w-52">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-neutral-900">{data.label}</p>
        {data.hasError ? (
          <AlertTriangle className="size-4 text-orange-500" />
        ) : (
          <CheckCircle2 className="size-4 text-emerald-600" />
        )}
      </div>
      <p className="mt-1 text-2xl font-semibold text-violet-700">{data.count.toLocaleString()}</p>
      <p className="mt-1 text-xs text-neutral-500">{data.description}</p>
    </div>
  );
}

const nodeTypes = { stage: StageNode };

function layout(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 80 });
  nodes.forEach((n) => g.setNode(n.id, { width: 208, height: 96 }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - 104, y: pos.y - 48 } };
  });
}

export function PipelineFlow({ summary }: { summary: PipelineSummary }) {
  const { nodes, edges } = useMemo(() => {
    const stageDefs = [
      { id: "source", label: "원천 데이터", count: summary.sourceCount, description: "등록된 URL/텍스트/파일" },
      { id: "extract", label: "본문 추출", count: summary.extractedCount, description: "본문 텍스트 확보" },
      { id: "clean", label: "데이터 정제", count: summary.extractedCount, description: "불필요 요소 제거 및 정규화" },
      { id: "chunk", label: "의미 단위 분할", count: summary.chunkedSourceCount, description: "800~1200 토큰 청크" },
      { id: "embed", label: "임베딩 생성", count: summary.embeddedChunkCount, description: "벡터 DB 저장 청크 수" },
      { id: "entity", label: "지식 추출", count: summary.entityCount, description: "추출된 지식 개체" },
      { id: "relation", label: "관계 분석", count: summary.relationCount, description: "지식 관계 + 의사결정 규칙" },
      { id: "brain", label: "마케팅 브레인 반영", count: summary.ruleCount, description: "의사결정 규칙 반영" },
    ];

    const rawNodes: Node[] = stageDefs.map((s) => ({
      id: s.id,
      type: "stage",
      position: { x: 0, y: 0 },
      data: { label: s.label, count: s.count, hasError: s.id === "source" && summary.failedCount > 0, description: s.description },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    }));

    const rawEdges: Edge[] = [
      { id: "e1", source: "source", target: "extract" },
      { id: "e2", source: "extract", target: "clean" },
      { id: "e3", source: "clean", target: "chunk" },
      { id: "e4", source: "chunk", target: "embed" },
      { id: "e5", source: "embed", target: "entity" },
      { id: "e6", source: "entity", target: "relation" },
      { id: "e7", source: "relation", target: "brain" },
    ].map((e) => ({ ...e, animated: true, style: { stroke: "#8b5cf6" } }));

    return { nodes: layout(rawNodes, rawEdges), edges: rawEdges };
  }, [summary]);

  return (
    <div className="h-[420px] rounded-2xl border border-neutral-200 bg-neutral-50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} color="#e5e5e5" />
      </ReactFlow>
    </div>
  );
}
