import { Package } from "lucide-react";
import { cn, seededNumber } from "@/lib/utils";

const PALETTE = ["#eef2ff", "#ecfdf3", "#fff7ed", "#fdf2f8", "#f0f9ff", "#f5f3ff"];

/**
 * 제품 대표 이미지. 이미지가 없으면(Mock) 제품명으로 정해지는 옅은 색 플레이스홀더를 보여준다.
 * 실제 이미지 연동 시 next/image 로 교체한다.
 */
export function ProductThumb({ name, imageUrl, className }: { name: string; imageUrl: string | null; className?: string }) {
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt={name} className={cn("object-cover", className)} />;
  }
  const bg = PALETTE[seededNumber(name, 0, PALETTE.length - 1)];
  return (
    <div className={cn("flex items-center justify-center", className)} style={{ background: bg }} aria-label={`${name} 이미지 없음`}>
      <Package className="size-7 text-fg-subtle/70" strokeWidth={1.5} />
    </div>
  );
}
