/** 브라우저에서 사진 줄이기 (v0.9.63): 긴 쪽 maxSide px JPEG data URL — 올리는 크기를 줄인다 (화면 전용) */
export async function shrinkImage(file: File, maxSide = 1536, quality = 0.9): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => no(new Error("사진을 읽지 못했습니다."));
      i.src = url;
    });
    const fit = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * fit);
    c.height = Math.round(img.naturalHeight * fit);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
