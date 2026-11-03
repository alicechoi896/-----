import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * v0.9.157 영상·클립 원고 유형 전환: 메뉴는 하나('영상 원고'·'클립 원고'), 화면 위쪽에서 제품 홍보 ↔ 정보성(제품 없이)
 * 기능(featureId)·학습 데이터·대본 포맷 유형은 그대로 나뉘어 있다
 */
export function ScriptTypeSwitch({ current, productHref, infoHref }: { current: "product" | "info"; productHref: string; infoHref: string }) {
  const item = (on: boolean, href: string, label: string, hint: string) => (
    <Link href={href} aria-current={on ? "page" : undefined} className={cn("rounded-control px-3 py-1.5 text-[13px]", on ? "bg-canvas font-semibold text-fg shadow-card ring-1 ring-line" : "text-fg-muted hover:text-fg")} title={hint}>
      {label}
    </Link>
  );
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2" data-script-type>
      <div className="inline-flex rounded-control border border-line bg-subtle p-0.5">
        {item(current === "product", productHref, "제품 홍보", "제품을 골라 홍보 원고를 만듭니다")}
        {item(current === "info", infoHref, "정보성 (제품 없이)", "제품 없이 정보·꿀팁 원고를 만듭니다")}
      </div>
      <span className="text-[12px] text-fg-subtle">{current === "product" ? "제품 없이 만들려면 [정보성]으로 바꾸세요. 대본 포맷·스타일도 정보성 것을 씁니다." : "제품 홍보 원고는 [제품 홍보]에서 제품을 고르세요."}</span>
    </div>
  );
}
