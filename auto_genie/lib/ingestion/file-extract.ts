import "server-only";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

export class FileExtractionError extends Error {}

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB, per spec

export const ACCEPTED_FILE_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "text/plain": [".txt"],
  "text/markdown": [".md"],
};

export function validateFile(file: { size: number; name: string; type: string }): void {
  if (file.size > MAX_FILE_BYTES) {
    throw new FileExtractionError("파일 크기는 최대 10MB까지 지원합니다.");
  }
  const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
  const allowedExts = Object.values(ACCEPTED_FILE_TYPES).flat();
  if (!allowedExts.includes(ext)) {
    throw new FileExtractionError("PDF, DOCX, TXT, Markdown 파일만 업로드할 수 있습니다.");
  }
}

export async function extractFileText(buffer: Buffer, fileName: string): Promise<string> {
  const ext = "." + (fileName.split(".").pop() ?? "").toLowerCase();

  if (ext === ".pdf") {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      if (!result.text.trim()) {
        throw new FileExtractionError("PDF에서 텍스트를 추출할 수 없습니다.");
      }
      return result.text.trim();
    } finally {
      await parser.destroy();
    }
  }

  if (ext === ".docx") {
    const { value } = await mammoth.extractRawText({ buffer });
    if (!value.trim()) {
      throw new FileExtractionError("DOCX에서 텍스트를 추출할 수 없습니다.");
    }
    return value.trim();
  }

  if (ext === ".txt" || ext === ".md") {
    const text = buffer.toString("utf-8").trim();
    if (!text) {
      throw new FileExtractionError("파일 내용이 비어 있습니다.");
    }
    return text;
  }

  throw new FileExtractionError("지원하지 않는 파일 형식입니다.");
}
