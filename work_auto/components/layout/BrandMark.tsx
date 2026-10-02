import Image from "next/image";
import { cn } from "@/lib/utils";

/** 로고 (램프). 원본은 assets/brand/icon-original.png, 화면용은 public/logo.png (256px) */
export function BrandMark({ size = 28, className }: { size?: number; className?: string }) {
  return <Image src="/logo.png" alt="" width={size} height={size} priority className={cn("shrink-0 rounded-lg", className)} />;
}
