"use client";

import { useState } from "react";
import { Download, FolderDown, ImageIcon } from "lucide-react";
import { PHOTO_MARKER, downloadBlob, type ProcessedPhoto } from "@/lib/photo-process";
import { createZip } from "@/lib/zip";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/**
 * 블로그 본문 미리보기: [사진n] 자리에 실제 사진을 보여준다.
 * 사진은 브라우저 메모리에만 있다 (서버에 없음). 복사할 때는 [사진n] 표시가 있는 텍스트를 복사하고,
 * 블로그에는 ZIP 으로 받은 사진을 번호 순서대로 올리면 된다.
 */
export function BodyWithPhotos({ text, photos }: { text: string; photos: ProcessedPhoto[] }) {
  const [zipping, setZipping] = useState(false);
  const parts = text.split(PHOTO_MARKER); // [텍스트, 번호, 텍스트, 번호, …]
  const used = new Set<number>();
  for (let i = 1; i < parts.length; i += 2) used.add(Number(parts[i]));
  const missing = photos.map((_, i) => i + 1).filter((n) => !used.has(n));

  async function downloadZip() {
    setZipping(true);
    try {
      const zip = await createZip(photos.map((p) => ({ name: p.name, blob: p.blob })));
      downloadBlob(zip, `${photos[0]?.name.replace(/_\d+\.jpg$/, "") || "제품사진"}_사진${photos.length}장.zip`);
    } finally {
      setZipping(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-brand-line bg-brand-soft/40 px-3 py-2 text-xs text-fg-muted">
        <span className="flex items-center gap-1.5">
          <ImageIcon className="size-3.5 text-brand" />
          사진 {photos.length}장이 본문 자리에 들어간 미리보기입니다. 블로그에는 ZIP 의 사진을 번호 순서대로 올리세요.
        </span>
        <Button size="sm" variant="primary" icon={FolderDown} loading={zipping} onClick={() => void downloadZip()}>
          사진 전체 다운로드 (ZIP)
        </Button>
      </div>
      <div className="max-h-[640px] overflow-y-auto rounded-control bg-subtle px-4 py-3 text-sm leading-7 text-fg">
        {parts.map((part, i) => {
          if (i % 2 === 0) return part ? <span key={i} className="whitespace-pre-wrap">{part}</span> : null;
          const n = Number(part);
          const photo = photos[n - 1];
          if (!photo) return <span key={i} className="font-semibold text-fg-subtle">[사진{n}]</span>;
          return <PhotoFigure key={i} n={n} photo={photo} />;
        })}
        {missing.length > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <p className="mb-2 text-xs text-fg-subtle">본문에 자리가 없는 사진 (원하는 위치에 직접 넣으세요)</p>
            {missing.map((n) => (
              <PhotoFigure key={n} n={n} photo={photos[n - 1]} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PhotoFigure({ n, photo }: { n: number; photo: ProcessedPhoto }) {
  return (
    <figure className={cn("my-3 block overflow-hidden rounded-control border border-line bg-canvas")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.url} alt={photo.caption || `사진${n}`} className="mx-auto block max-h-[360px] w-auto" />
      <figcaption className="flex items-center justify-between gap-2 border-t border-line px-3 py-1.5 text-xs text-fg-subtle">
        <span>
          <b className="mr-1.5 text-fg">사진{n}</b>
          {photo.caption}
        </span>
        <button type="button" onClick={() => downloadBlob(photo.blob, photo.name)} className="inline-flex items-center gap-1 hover:text-brand">
          <Download className="size-3.5" />
          {photo.name}
        </button>
      </figcaption>
    </figure>
  );
}
