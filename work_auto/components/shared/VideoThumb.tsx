import { cn, formatDuration } from "@/lib/utils";

/**
 * 영상 썸네일. 실제 이미지(thumbnailUrl)가 있으면 이미지를, 없으면(Mock) 옅은 색 박스를 보여준다.
 * 길이 배지와 Shorts 배지를 함께 표시한다.
 */
export function VideoThumb({
  thumbnailUrl,
  color,
  durationSec,
  shorts,
  className,
}: {
  thumbnailUrl?: string;
  color: string;
  durationSec: number;
  shorts?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative shrink-0 overflow-hidden rounded-md ring-1 ring-line", className)} style={{ background: color }}>
      {thumbnailUrl && (
        // 외부(ytimg.com) 이미지라 next/image 대신 img 를 쓴다
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnailUrl} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
      )}
      {shorts && <span className="absolute top-1 left-1 rounded bg-fg/75 px-1 text-[10px] font-semibold text-white">Shorts</span>}
      {durationSec > 0 && (
        <span className="tabular absolute right-1 bottom-1 rounded bg-fg/75 px-1 text-[10px] text-white">{formatDuration(durationSec)}</span>
      )}
    </div>
  );
}
