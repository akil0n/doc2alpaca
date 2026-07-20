import { inferFileType } from "./textExtractor.ts";
import type { FileType } from "../types/index.ts";

const MIME_TYPES: Record<FileType, string[]> = {
  pdf: ["application/pdf"],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  pptx: [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
  txt: ["text/plain"],
  md: ["text/markdown", "text/plain"],
  html: ["text/html", "application/xhtml+xml"],
};

interface UploadCandidate {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  maxExpandedSize?: number;
}

function assertMimeType(fileType: FileType, mimeType: string): void {
  if (!mimeType || mimeType === "application/octet-stream") {
    throw new Error("File MIME type is missing or not approved");
  }
  if (!MIME_TYPES[fileType].includes(mimeType.toLowerCase())) {
    throw new Error("File MIME type does not match its extension");
  }
}

function assertPdfSignature(buffer: Buffer): void {
  if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("File signature does not match PDF");
  }
}

function assertTextSignature(buffer: Buffer): void {
  if (buffer.includes(0)) {
    throw new Error("File signature is binary, not text");
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new Error("File signature is not valid UTF-8 text");
  }
}

async function assertOoxmlSignature(
  buffer: Buffer,
  fileType: "docx" | "pptx",
  maxExpandedSize: number
): Promise<void> {
  if (
    buffer.length < 4 ||
    buffer[0] !== 0x50 ||
    buffer[1] !== 0x4b ||
    !(
      (buffer[2] === 0x03 && buffer[3] === 0x04) ||
      (buffer[2] === 0x05 && buffer[3] === 0x06) ||
      (buffer[2] === 0x07 && buffer[3] === 0x08)
    )
  ) {
    throw new Error(`File signature does not match ${fileType.toUpperCase()}`);
  }

  const { default: JSZip } = await import("jszip");
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error(`File signature does not match ${fileType.toUpperCase()}`);
  }

  const { inflateRawSync } = await import("node:zlib");
  let expandedSize = 0;
  for (const entry of Object.values(zip.files) as Array<{
    dir: boolean;
    _data?: {
      compressedContent?: Uint8Array;
      compression?: { magic?: string };
    };
  }>) {
    if (entry.dir) continue;
    const compressed = Buffer.from(entry._data?.compressedContent ?? []);
    const remaining = maxExpandedSize - expandedSize;
    if (remaining <= 0) {
      throw new Error("OOXML expanded size exceeds the safety limit");
    }

    try {
      const magic = entry._data?.compression?.magic;
      const actualSize =
        magic === "\b\0"
          ? inflateRawSync(compressed, { maxOutputLength: remaining }).length
          : magic === "\0\0"
            ? compressed.length
            : (() => {
                throw new Error("unsupported ZIP compression");
              })();
      expandedSize += actualSize;
      if (expandedSize > maxExpandedSize) {
        throw new Error("expanded size limit");
      }
    } catch {
      throw new Error("OOXML expanded size exceeds the safety limit");
    }
  }

  const requiredPrefix = fileType === "docx" ? "word/" : "ppt/";
  if (
    !zip.files["[Content_Types].xml"] ||
    !Object.keys(zip.files).some((name) => name.startsWith(requiredPrefix))
  ) {
    throw new Error(`File signature does not match ${fileType.toUpperCase()}`);
  }
}

export async function validateUpload({
  buffer,
  fileName,
  mimeType,
  maxExpandedSize = 50 * 1024 * 1024,
}: UploadCandidate): Promise<{ fileType: FileType }> {
  const fileType = inferFileType(fileName);
  assertMimeType(fileType, mimeType);

  if (fileType === "pdf") {
    assertPdfSignature(buffer);
  } else if (fileType === "docx" || fileType === "pptx") {
    await assertOoxmlSignature(buffer, fileType, maxExpandedSize);
  } else {
    assertTextSignature(buffer);
  }

  return { fileType };
}
