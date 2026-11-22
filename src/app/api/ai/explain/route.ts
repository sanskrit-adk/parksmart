import { z } from "zod";
import { handler, ok, parseJson } from "@/lib/api";
import { getOpenAI, models, structured } from "@/lib/ai/openai";

const place = z.object({
  name: z.string().max(200),
  hourly_price: z.number().min(0).max(1000),
  walk_minutes: z.number().min(0).max(600),
  predicted_availability: z.number().min(0).max(1),
  predicted_free_spaces: z.number().min(0).max(100000),
  covered: z.boolean(),
  ev_charging: z.boolean(),
  accessible: z.boolean(),
  estimated_total: z.number().min(0).max(100000),
  availability_mode: z.enum(["live", "estimated"]).nullable(),
});

const schema = z.object({
  pick: place,
  alternatives: z.array(place).max(4),
  template: z.string().max(1000),
  request: z.string().max(500).nullable().optional(),
  destination: z.string().max(200).nullable().optional(),
  duration_hours: z.number().min(0).max(48),
});

/**
 * GenAI recommendation explanation: rewrites the ranking model's factual
 * reasons into a short, friendly paragraph comparing the pick with the
 * alternatives. Uses only the numbers it is given. Falls back to the
 * template sentence when no LLM is configured.
 */
export const POST = handler(async (req: Request) => {
  const body = await parseJson(req, schema);
  if (!getOpenAI()) return ok({ explanation: body.template, engine: "template" });
  try {
    const out = await structured<{ explanation: string }>({
      name: "recommendation_explanation",
      system:
        "You explain to a driver why ParkSmart recommends a parking location. Write 2-3 short sentences in plain English, starting with " +
        "'This parking location is recommended because'. Compare with the alternatives where it helps (e.g. cheaper, closer, more likely to have space). " +
        "Use only the facts given; never invent prices, distances or amenities. Availability numbers are ML predictions: call them 'predicted'. " +
        "If the pick has a real downside (e.g. pricier or a longer walk), mention it briefly.",
      user: JSON.stringify(body),
      maxTokens: 220,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["explanation"],
        properties: { explanation: { type: "string" } },
      },
    });
    return ok({ explanation: out.explanation, engine: models().text });
  } catch {
    return ok({ explanation: body.template, engine: "template" });
  }
});
