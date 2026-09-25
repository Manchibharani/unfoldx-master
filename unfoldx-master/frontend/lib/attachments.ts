"use client";

import type { FileDraft } from "./graph";

/**
 * Reads files picked from <input type="file"> into FileDraft objects the
 * orchestration store can pin to agents/nodes. Content is kept truncated so a
 * giant binary never blows up the in-memory override state — the UI only
 * really needs names, sizes and a readable preview.
 */
export const MAX_TEXT_FILE_BYTES = 256 * 1024;
export const MAX_TEXT_LENGTH = 16_000;

export async function readFiles(fileList: FileList | File[] | null): Promise<FileDraft[]> {
  if (!fileList) return [];
  const files = Array.from(fileList);
  const drafts: FileDraft[] = [];
  for (const file of files) {
    let content = "";
    if (file.size <= MAX_TEXT_FILE_BYTES) {
      try {
        const text = await file.text();
        content = text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH)}\n…` : text;
      } catch {
        content = "";
      }
    }
    drafts.push({
      id: typeof crypto !== "undefined" ? crypto.randomUUID() : `file-${Math.random().toString(36).slice(2)}`,
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      content,
      raw: file,
    });
  }
  return drafts;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}