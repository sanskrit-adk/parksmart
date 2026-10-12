import "server-only";

import { ApiError } from "@/lib/api";

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Reads an uploaded image (multipart field) with type/size validation. */
export async function readImageField(form: FormData, field = "image") {
  const file = form.get(field);
  if (!(file instanceof File) || file.size === 0) return null;
  if (!IMAGE_TYPES.includes(file.type as (typeof IMAGE_TYPES)[number])) throw new ApiError(415, "Upload a JPEG, PNG or WebP image");
  if (file.size > MAX_IMAGE_BYTES) throw new ApiError(413, "Image must be under 10 MB");
  return { bytes: Buffer.from(await file.arrayBuffer()), type: file.type };
}

/**
 * Fetches a camera snapshot URL. Only public https endpoints are allowed to
 * avoid the server being used to probe internal networks.
 */
export async function fetchSnapshot(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ApiError(400, "Camera URL is not valid");
  }
  const host = url.hostname;
  const privateHost =
    host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") ||
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host === "[::1]" || /^\[?f[cd]/i.test(host);
  if (url.protocol !== "https:" || privateHost) throw new ApiError(400, "Camera URL must be a public https:// snapshot address");

  const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!res?.ok) throw new ApiError(502, "Could not fetch a snapshot from the camera URL");
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!IMAGE_TYPES.includes(type as (typeof IMAGE_TYPES)[number])) throw new ApiError(415, "Camera URL did not return a JPEG, PNG or WebP image");
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) throw new ApiError(413, "Snapshot is larger than 10 MB");
  return { bytes, type };
}

/** Width/height from PNG, JPEG or WebP headers (no native deps). */
export function imageSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buf.toString("ascii", 12, 16);
    if (chunk === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (chunk === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L") {
      const b = buf.readUInt32LE(21);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
  }
  return null;
}

export function dataUrl(bytes: Buffer, type: string) {
  return `data:${type};base64,${bytes.toString("base64")}`;
}
