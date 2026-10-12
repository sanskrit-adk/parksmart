import { z } from "zod";
import { handler, ok, parseJson } from "@/lib/api";
import { runAssistant } from "@/lib/ai/assistant";
import { getSession } from "@/lib/auth";

export const maxDuration = 60;

const schema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .min(1)
    .max(40),
  position: z.object({ lat: z.number(), lng: z.number() }).nullable().optional(),
});

export const POST = handler(async (req: Request) => {
  const { messages, position } = await parseJson(req, schema);
  const { supabase, profile } = await getSession();
  return ok(await runAssistant(supabase, profile, messages, position ?? null));
});
