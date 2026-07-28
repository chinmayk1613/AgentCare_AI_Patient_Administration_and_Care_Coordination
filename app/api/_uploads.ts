import { env } from "cloudflare:workers";

type PrivateBucket = {
  put: (
    key: string,
    value: ArrayBuffer | Uint8Array | string,
    options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> },
  ) => Promise<unknown>;
};

export const UPLOAD_CHUNK_SIZE = 512 * 1024;
export const MAX_UPLOAD_SIZE = 25 * 1024 * 1024;
export const ACCEPTED_UPLOAD_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "text/plain"]);

export function privateUploads() {
  const bucket = (env as unknown as { UPLOADS?: PrivateBucket }).UPLOADS;
  if (!bucket) throw new Error("Private R2 binding UPLOADS is unavailable");
  return bucket;
}

export function safeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "document";
}

export async function sha256(value: ArrayBuffer | Uint8Array | string) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

export function classifyDocument(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.includes("ecg") || lower.includes("ekg")) return "ECG";
  if (lower.includes("mri") || lower.includes("magnetic")) return "MRI_REPORT";
  if (lower.includes("blood") || lower.includes("lab")) return "LAB_REPORT";
  if (lower.includes("referral")) return "REFERRAL";
  return "OTHER_MEDICAL_RECORD";
}

export function inspectChunk(bytes: Uint8Array, contentType: string, chunkNumber: number) {
  const flags: string[] = [];
  if (chunkNumber === 0) {
    const magic = [...bytes.slice(0, 8)];
    const valid =
      contentType === "text/plain" ||
      (contentType === "application/pdf" && String.fromCharCode(...magic.slice(0, 4)) === "%PDF") ||
      (contentType === "image/png" && magic.slice(0, 4).join(",") === "137,80,78,71") ||
      (contentType === "image/jpeg" && magic.slice(0, 2).join(",") === "255,216");
    if (!valid) flags.push("mime_signature_mismatch");
  }
  const probe = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 80_000)).toLowerCase();
  if (["ignore previous instructions", "system prompt", "cancel all appointments", "call this tool"].some((term) => probe.includes(term))) {
    flags.push("prompt_injection");
  }
  if (probe.includes("<script") || probe.includes("powershell.exe") || probe.includes("cmd.exe")) flags.push("active_content");
  return flags;
}
