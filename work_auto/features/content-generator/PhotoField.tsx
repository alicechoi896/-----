"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, ImagePlus, Sparkles, Trash2 } from "lucide-react";
import type { FieldDef } from "@/lib/generators/types";
import {
  MAX_PHOTOS,
  RECOMMENDED_PHOTOS,
  photoFileName,
  processPhoto,
  thumbnailBase64,
  type PhotoRatio,
  type ProcessedPhoto,
} from "@/lib/photo-process";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { IconButton } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/Tabs";
import { cn } from "@/lib/utils";

/** 처리 전 원본도 함께 들고 있어야 비율을 바꿔 다시 처리할 수 있다 */
export type PhotoItem = ProcessedPhoto & { file: File };

const RATIOS: { value: PhotoRatio; label: string }[] = [
  { value: "original", label: "원본 비율" },
  { value: "1:1", label: "1:1" },
  { value: "4:3", label: "4:3" },
];

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`);

/**
 * 제품 사진 칸 (블로그 제품 글).
 * 사진은 브라우저에서만 처리하고 서버로 올리지 않는다. 서버(AI)에는 "사진n: 설명" 목록만 간다.
 */
export function PhotoField({
  field,
  photos,
  onChange,
  baseName,
}: {
  field: FieldDef;
  photos: PhotoItem[];
  onChange: (next: PhotoItem[]) => void;
  /** 파일 이름 앞부분 (메인 키워드) */
  baseName: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [ratio, setRatio] = useState<PhotoRatio>("original");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rename = (list: PhotoItem[]) => list.map((p, i) => ({ ...p, name: photoFileName(baseName, i) }));

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const room = MAX_PHOTOS - photos.length;
    const picked = Array.from(files).filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name));
    if (room <= 0) {
      setError(`사진은 ${MAX_PHOTOS}장까지 넣을 수 있습니다.`);
      return;
    }
    const added: PhotoItem[] = [];
    const errors: string[] = [];
    for (const [i, file] of picked.slice(0, room).entries()) {
      setBusy(`사진 처리 중… (${i + 1}/${Math.min(picked.length, room)})`);
      try {
        const out = await processPhoto(file, ratio);
        added.push({
          id: `${Date.now()}-${i}-${file.name}`,
          name: "",
          originalName: file.name,
          blob: out.blob,
          url: URL.createObjectURL(out.blob),
          width: out.width,
          height: out.height,
          sizeBefore: file.size,
          caption: "",
          file,
        });
      } catch (e) {
        errors.push(e instanceof Error ? e.message : `${file.name}: 처리하지 못했습니다.`);
      }
    }
    if (picked.length > room) errors.push(`${MAX_PHOTOS}장을 넘는 사진은 빼고 넣었습니다.`);
    setBusy(null);
    setError(errors.length ? errors.join(" ") : null);
    onChange(rename([...photos, ...added]));
    if (inputRef.current) inputRef.current.value = "";
  }

  /** 비율을 바꾸면 이미 넣은 사진도 원본에서 다시 처리한다 */
  async function changeRatio(next: PhotoRatio) {
    setRatio(next);
    if (!photos.length) return;
    setBusy("비율을 바꿔 다시 처리하는 중…");
    const redone: PhotoItem[] = [];
    for (const p of photos) {
      const out = await processPhoto(p.file, next);
      URL.revokeObjectURL(p.url);
      redone.push({ ...p, blob: out.blob, url: URL.createObjectURL(out.blob), width: out.width, height: out.height });
    }
    setBusy(null);
    onChange(rename(redone));
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...photos];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    onChange(rename(next));
  }

  function remove(index: number) {
    URL.revokeObjectURL(photos[index].url);
    onChange(rename(photos.filter((_, i) => i !== index)));
  }

  async function describe() {
    setBusy("AI 가 사진을 보고 설명을 쓰는 중…");
    setError(null);
    try {
      const images = await Promise.all(photos.map(async (p) => ({ mediaType: "image/jpeg", data: await thumbnailBase64(p.blob) })));
      const { captions } = await api.photos.describe(images, baseName);
      onChange(photos.map((p, i) => ({ ...p, caption: p.caption.trim() || captions[i] || p.caption })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "사진 설명을 만들지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  const totalAfter = photos.reduce((n, p) => n + p.blob.size, 0);
  const totalBefore = photos.reduce((n, p) => n + p.sizeBefore, 0);

  return (
    <FormField label={`${field.label} · ${photos.length}/${MAX_PHOTOS}장`} optional hint={field.hint} className="col-span-2">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => void addFiles(e.target.files)} />
          <Button size="sm" icon={ImagePlus} disabled={Boolean(busy) || photos.length >= MAX_PHOTOS} onClick={() => inputRef.current?.click()}>
            사진 추가
          </Button>
          <SegmentedControl size="sm" options={RATIOS} value={ratio} onChange={(v) => void changeRatio(v)} />
          {photos.length > 0 && (
            <Button size="sm" variant="ghost" icon={Sparkles} disabled={Boolean(busy)} onClick={() => void describe()} title="비어 있는 설명만 채웁니다">
              AI로 사진 설명 채우기
            </Button>
          )}
        </div>

        {photos.length === 0 ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void addFiles(e.dataTransfer.files);
            }}
            className="flex w-full flex-col items-center justify-center gap-1 rounded-control border border-dashed border-line-strong bg-subtle/50 px-4 py-6 text-[13px] text-fg-subtle hover:border-brand-line hover:text-brand"
          >
            <ImagePlus className="size-5" />
            사진을 끌어다 놓거나 눌러서 고르세요 ({RECOMMENDED_PHOTOS}장 권장)
          </button>
        ) : (
          <ul className="space-y-2">
            {photos.map((p, i) => (
              <li key={p.id} className="flex items-center gap-2.5 rounded-control border border-line p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`사진${i + 1}`} className="size-14 shrink-0 rounded-md object-cover ring-1 ring-line" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 text-xs text-fg-subtle">
                    <span className="rounded bg-fg px-1.5 py-px font-semibold text-white">사진{i + 1}</span>
                    <span className="truncate">
                      {p.width}×{p.height} · {kb(p.blob.size)}
                    </span>
                  </div>
                  <Input
                    value={p.caption}
                    maxLength={60}
                    placeholder="무엇이 보이나요? 예: 정면 전체 모습"
                    className="h-8"
                    onChange={(e) => onChange(photos.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))}
                  />
                </div>
                <div className="flex shrink-0 flex-col">
                  <IconButton icon={ArrowUp} label="앞으로" size="sm" disabled={i === 0} onClick={() => move(i, -1)} />
                  <IconButton icon={ArrowDown} label="뒤로" size="sm" disabled={i === photos.length - 1} onClick={() => move(i, 1)} />
                </div>
                <IconButton icon={Trash2} label="빼기" size="sm" onClick={() => remove(i)} className="hover:text-danger" />
              </li>
            ))}
          </ul>
        )}

        {(busy || error || photos.length > 0) && (
          <p className={cn("text-xs", error ? "text-danger" : "text-fg-subtle")}>
            {busy ??
              error ??
              `원본 ${kb(totalBefore)} → ${kb(totalAfter)} · 사진은 이 화면에만 있고 새로고침하면 사라집니다. 결과 화면에서 ZIP 으로 내려받으세요.`}
          </p>
        )}
      </div>
    </FormField>
  );
}
