import { Badge } from "@/components/ui/badge";
import { FlaskConical, Sparkles, Wrench, Link2 } from "lucide-react";

export type DemoBadgeVariant = "prototype" | "demo-result" | "in-progress" | "planned";

const VARIANTS: Record<
  DemoBadgeVariant,
  { label: string; className: string; icon: typeof FlaskConical }
> = {
  prototype: {
    label: "시제품 예시 데이터",
    className: "border-amber-300 bg-amber-50 text-amber-700",
    icon: FlaskConical,
  },
  "demo-result": {
    label: "데모 분석 결과",
    className: "border-sky-300 bg-sky-50 text-sky-700",
    icon: Sparkles,
  },
  "in-progress": {
    label: "개발 중",
    className: "border-violet-300 bg-violet-50 text-violet-700",
    icon: Wrench,
  },
  planned: {
    label: "연동 예정",
    className: "border-neutral-300 bg-neutral-100 text-neutral-600",
    icon: Link2,
  },
};

/** Shared badge for every mock/prototype data surface added on top of the real pipeline. */
export function DemoBadge({
  variant = "prototype",
  className = "",
}: {
  variant?: DemoBadgeVariant;
  className?: string;
}) {
  const v = VARIANTS[variant];
  const Icon = v.icon;
  return (
    <Badge variant="outline" className={`${v.className} ${className}`}>
      <Icon className="size-3" /> {v.label}
    </Badge>
  );
}
