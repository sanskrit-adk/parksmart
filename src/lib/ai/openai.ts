import "server-only";

import OpenAI from "openai";
import { serverEnv } from "@/lib/env";

let client: OpenAI | null = null;

/** Returns null when OPENAI_API_KEY is not configured so callers can degrade gracefully. */
export function getOpenAI() {
  const { openaiApiKey } = serverEnv();
  if (!openaiApiKey) return null;
  client ??= new OpenAI({ apiKey: openaiApiKey, timeout: 30_000, maxRetries: 1 });
  return client;
}

export function models() {
  const env = serverEnv();
  return { text: env.openaiModel, vision: env.openaiVisionModel };
}

/** Calls the model with a strict JSON schema and returns the parsed object. */
export async function structured<T>(opts: {
  name: string;
  schema: Record<string, unknown>;
  system: string;
  user: string | OpenAI.Chat.Completions.ChatCompletionContentPart[];
  model?: string;
  maxTokens?: number;
}): Promise<T> {
  const openai = getOpenAI();
  if (!openai) throw new Error("AI is not configured");
  const res = await openai.chat.completions.create({
    model: opts.model ?? models().text,
    temperature: 0.2,
    max_completion_tokens: opts.maxTokens ?? 800,
    response_format: { type: "json_schema", json_schema: { name: opts.name, strict: true, schema: opts.schema } },
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  });
  const content = res.choices[0]?.message?.content;
  if (!content) throw new Error("Empty AI response");
  return JSON.parse(content) as T;
}
