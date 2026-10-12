import "server-only";

import { ApiError } from "@/lib/api";
import { getOpenAI, models, structured } from "@/lib/ai/openai";
import { serverEnv } from "@/lib/env";
import { dataUrl, imageSize } from "@/lib/images";
import type { DetectionBox } from "@/lib/types";

export interface DetectionResult {
  boxes: DetectionBox[];
  free_count: number;
  occupied_count: number;
  width: number | null;
  height: number | null;
  model: string;
  engine: "yolo" | "vision-llm";
}

/**
 * Counts free vs occupied spaces in a lot image.
 *  1. YOLOv8 FastAPI service (services/cv) when CV_SERVICE_URL is set — precise boxes.
 *  2. Otherwise a vision LLM — good counts, approximate boxes.
 */
export async function detectSpaces(bytes: Buffer, type: string, expectedSpaces?: number): Promise<DetectionResult> {
  const env = serverEnv();
  const size = imageSize(bytes);

  if (env.cvServiceUrl) {
    const form = new FormData();
    form.append("image", new Blob([new Uint8Array(bytes)], { type }), "snapshot");
    if (expectedSpaces) form.append("expected_spaces", String(expectedSpaces));
    const res = await fetch(`${env.cvServiceUrl.replace(/\/$/, "")}/detect`, {
      method: "POST",
      body: form,
      headers: env.cvServiceToken ? { Authorization: `Bearer ${env.cvServiceToken}` } : undefined,
      signal: AbortSignal.timeout(60_000),
    }).catch(() => null);
    if (!res?.ok) throw new ApiError(502, "The detection service is unavailable");
    const json = (await res.json()) as Omit<DetectionResult, "engine">;
    return { ...json, width: json.width ?? size?.width ?? null, height: json.height ?? size?.height ?? null, engine: "yolo" };
  }

  if (!getOpenAI()) {
    throw new ApiError(503, "No detection engine configured. Set CV_SERVICE_URL (YOLO service) or OPENAI_API_KEY.");
  }

  const result = await structured<{ free_count: number; occupied_count: number; boxes: DetectionBox[]; notes: string }>({
    name: "parking_detection",
    model: models().vision,
    maxTokens: 2500,
    system:
      "You analyse photos of parking lots and garages. Identify individual parking spaces and classify each as 'occupied' (a vehicle is in it) " +
      "or 'free' (an empty marked bay). Only count spaces you can actually see. Give each space a bounding box in normalized image coordinates " +
      "(x, y = top-left corner, w, h = size; all between 0 and 1) and a confidence 0..1. free_count and occupied_count must equal the box counts.",
    user: [
      {
        type: "text",
        text: expectedSpaces
          ? `The operator says this area has about ${expectedSpaces} spaces. Detect and classify them.`
          : "Detect and classify the parking spaces in this image.",
      },
      { type: "image_url", image_url: { url: dataUrl(bytes, type), detail: "high" } },
    ],
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["free_count", "occupied_count", "boxes", "notes"],
      properties: {
        free_count: { type: "integer" },
        occupied_count: { type: "integer" },
        notes: { type: "string" },
        boxes: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["x", "y", "w", "h", "label", "confidence"],
            properties: {
              x: { type: "number" },
              y: { type: "number" },
              w: { type: "number" },
              h: { type: "number" },
              label: { type: "string", enum: ["occupied", "free"] },
              confidence: { type: "number" },
            },
          },
        },
      },
    },
  });

  const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
  const boxes = result.boxes
    .map((b) => ({ ...b, x: clamp01(b.x), y: clamp01(b.y), w: clamp01(b.w), h: clamp01(b.h), confidence: clamp01(b.confidence) }))
    .filter((b) => b.w > 0 && b.h > 0);
  return {
    boxes,
    free_count: boxes.length ? boxes.filter((b) => b.label === "free").length : Math.max(0, result.free_count),
    occupied_count: boxes.length ? boxes.filter((b) => b.label === "occupied").length : Math.max(0, result.occupied_count),
    width: size?.width ?? null,
    height: size?.height ?? null,
    model: models().vision,
    engine: "vision-llm",
  };
}
