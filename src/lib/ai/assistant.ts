import "server-only";

import type OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOpenAI, models } from "@/lib/ai/openai";
import { ruleParse } from "@/lib/ai/search-parser";
import { dateTime, money, percent } from "@/lib/format";
import { geocode } from "@/lib/geocode";
import { SF_CENTER } from "@/lib/geo";
import { priceBreakdown, refundFor } from "@/lib/pricing";
import { DEFAULT_FILTERS, searchParking } from "@/lib/search";
import type { Booking, ForecastPoint, ParkingLocation, Profile, RankedLocation } from "@/lib/types";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Actions that move money are only ever proposed; the UI asks the user to confirm. */
export type ProposedAction =
  | { type: "book"; location_id: string; location_name: string; start_time: string; end_time: string; vehicle_plate: string | null; total: number; hours: number }
  | { type: "extend"; booking_id: string; location_name: string; minutes: number; new_end_time: string; amount: number }
  | { type: "cancel"; booking_id: string; location_name: string; refund: number; rule: string };

export interface ResultCard {
  id: string;
  name: string;
  hourly_price: number;
  walk_minutes: number;
  free_probability: number;
  ai_pick: boolean;
  reason: string;
  availability_mode: string | null;
}

export interface AssistantReply {
  reply: string;
  actions: ProposedAction[];
  cards: ResultCard[];
  engine: "ai" | "rules";
}

interface Ctx {
  supabase: SupabaseClient;
  profile: Profile | null;
  position: { lat: number; lng: number } | null;
  actions: ProposedAction[];
  cards: ResultCard[];
}

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_parking",
      description: "Find and rank parking near a destination (or near the user if no place). Returns the best options with prices, walking time and availability predictions.",
      parameters: {
        type: "object",
        properties: {
          place: { type: "string", description: "Destination with city, e.g. 'Oracle Park, San Francisco'. Omit to search near the user." },
          duration_hours: { type: "number" },
          arrive_at: { type: "string", description: "ISO 8601 arrival time with offset; omit for now." },
          max_price_per_hour: { type: "number" },
          max_total_price: { type: "number" },
          covered: { type: "boolean" },
          ev_charging: { type: "boolean" },
          accessible: { type: "boolean" },
          sort: { type: "string", enum: ["best", "price", "distance", "availability"] },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_location_details",
      description: "Details for one parking location: price, amenities, hours, current availability and the forecast for the next hours.",
      parameters: { type: "object", properties: { location_id: { type: "string" } }, required: ["location_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_my_bookings",
      description: "The signed-in user's bookings (upcoming, active and recent).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_booking",
      description: "Prepare a booking for the user to confirm and pay. Does NOT charge or book anything by itself.",
      parameters: {
        type: "object",
        properties: {
          location_id: { type: "string" },
          start_time: { type: "string", description: "ISO 8601 with offset. Use now (rounded up to 5 minutes) if the user wants to park now." },
          duration_hours: { type: "number" },
          vehicle_plate: { type: "string" },
        },
        required: ["location_id", "start_time", "duration_hours"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_extension",
      description: "Prepare extending an upcoming/active booking for the user to confirm and pay.",
      parameters: {
        type: "object",
        properties: { booking_id: { type: "string" }, minutes: { type: "integer", minimum: 15, maximum: 720 } },
        required: ["booking_id", "minutes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_cancellation",
      description: "Prepare cancelling a booking (shows the refund the policy allows) for the user to confirm.",
      parameters: { type: "object", properties: { booking_id: { type: "string" } }, required: ["booking_id"] },
    },
  },
];

export async function runAssistant(
  supabase: SupabaseClient,
  profile: Profile | null,
  messages: ChatMessage[],
  position: { lat: number; lng: number } | null,
): Promise<AssistantReply> {
  const ctx: Ctx = { supabase, profile, position, actions: [], cards: [] };
  const openai = getOpenAI();
  if (!openai) return rulesAssistant(ctx, messages);

  const now = new Date();
  const convo: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: [
        "You are ParkSmart's parking assistant. ParkSmart works anywhere: San Francisco has curated city data, and other areas use OpenStreetMap parking loaded on demand. Be brief, warm and concrete (2–4 sentences, plain text, no markdown tables).",
        `Current time: ${now.toISOString()}.`,
        profile ? `The user is signed in as ${profile.name ?? "a driver"}.` : "The user is NOT signed in: they can search, but must sign in to book or manage bookings.",
        position ? "The user's current location is known." : "The user's location is unknown; ask for a destination if needed.",
        "Always use tools for facts about parking, prices, availability and bookings — never invent them.",
        "To book, extend or cancel, call the matching propose_* tool. These only prepare the action: tell the user to review and press Confirm. Never say a booking, payment, extension or cancellation is complete.",
        "Availability labelled 'estimated' comes from a model; 'live' comes from bookings or a camera. Mention which when it matters.",
      ].join(" "),
    },
    ...messages.slice(-16).map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }) as OpenAI.Chat.Completions.ChatCompletionMessageParam),
  ];

  for (let step = 0; step < 5; step++) {
    const res = await openai.chat.completions.create({
      model: models().text,
      temperature: 0.3,
      max_completion_tokens: 600,
      messages: convo,
      tools: TOOLS,
    });
    const msg = res.choices[0]?.message;
    if (!msg) break;
    convo.push(msg);
    const calls = msg.tool_calls?.filter((c) => c.type === "function") ?? [];
    if (!calls.length) {
      return { reply: msg.content?.trim() || "How can I help you park?", actions: ctx.actions, cards: ctx.cards, engine: "ai" };
    }
    for (const call of calls) {
      let output: unknown;
      try {
        output = await runTool(ctx, call.function.name, JSON.parse(call.function.arguments || "{}"));
      } catch (err) {
        output = { error: err instanceof Error ? err.message : "Tool failed" };
      }
      convo.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(output) });
    }
  }
  return { reply: "Here's what I found.", actions: ctx.actions, cards: ctx.cards, engine: "ai" };
}

type Args = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const bool = (v: unknown) => (typeof v === "boolean" ? v : null);

async function runTool(ctx: Ctx, name: string, args: Args) {
  switch (name) {
    case "search_parking":
      return toolSearch(ctx, args);
    case "get_location_details":
      return toolDetails(ctx, String(args.location_id));
    case "list_my_bookings":
      return toolMyBookings(ctx);
    case "propose_booking":
      return toolProposeBooking(ctx, args);
    case "propose_extension":
      return toolProposeExtension(ctx, String(args.booking_id), Number(args.minutes));
    case "propose_cancellation":
      return toolProposeCancel(ctx, String(args.booking_id));
    default:
      return { error: `Unknown tool ${name}` };
  }
}

async function toolSearch(ctx: Ctx, args: Args) {
  const place = str(args.place);
  let center = ctx.position ?? SF_CENTER;
  let placeName: string | null = null;
  if (place) {
    const [hit] = await geocode(place, { proximity: ctx.position ?? undefined, limit: 1 });
    if (!hit) return { error: `Couldn't find "${place}"` };
    center = { lat: hit.lat, lng: hit.lng };
    placeName = hit.address || hit.name;
  }
  const { results } = await searchParking(
    ctx.supabase,
    {
      ...DEFAULT_FILTERS,
      lat: center.lat,
      lng: center.lng,
      duration_hours: num(args.duration_hours) ?? 2,
      arrive_at: str(args.arrive_at),
      max_price_per_hour: num(args.max_price_per_hour),
      max_total_price: num(args.max_total_price),
      covered: bool(args.covered),
      ev_charging: bool(args.ev_charging),
      accessible: bool(args.accessible),
      sort: (str(args.sort) as "best" | null) ?? "best",
    },
    ctx.profile?.preferences,
    25,
  );
  const top = results.slice(0, 5);
  ctx.cards = top.map(toCard);
  return {
    searched_near: placeName ?? (ctx.position ? "the user's location" : "downtown San Francisco (location unknown)"),
    results: top.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      hourly_price: r.hourly_price,
      price_is_estimate: r.price_estimated,
      walk_minutes: r.walk_minutes,
      chance_free_on_arrival: percent(r.free_probability),
      availability: r.availability_mode,
      covered: r.covered,
      ev_charging: r.ev_charging,
      estimated_total: r.estimated_total,
      ai_pick: r.ai_pick,
      why: r.reason,
    })),
  };
}

function toCard(r: RankedLocation): ResultCard {
  return {
    id: r.id,
    name: r.name,
    hourly_price: r.hourly_price,
    walk_minutes: r.walk_minutes,
    free_probability: r.free_probability,
    ai_pick: r.ai_pick,
    reason: r.reason,
    availability_mode: r.availability_mode,
  };
}

async function toolDetails(ctx: Ctx, id: string) {
  const { data: loc } = await ctx.supabase.from("parking_locations").select("*").eq("id", id).maybeSingle<ParkingLocation>();
  if (!loc) return { error: "Location not found" };
  const { data: fc } = await ctx.supabase.rpc("location_forecast", { p_location_id: id, p_hours: 8 });
  return {
    id: loc.id,
    name: loc.name,
    address: loc.address,
    type: loc.type,
    hourly_price: Number(loc.hourly_price),
    price_is_estimate: loc.price_estimated,
    covered: loc.covered,
    ev_charging: loc.ev_charging,
    accessible: loc.accessible,
    rating: loc.rating,
    available_now: loc.available_now,
    availability: loc.availability_mode,
    forecast_next_hours: ((fc ?? []) as ForecastPoint[]).map((p) => ({ at: dateTime(p.ts), chance_free: percent(Number(p.free_probability)) })),
  };
}

async function toolMyBookings(ctx: Ctx) {
  if (!ctx.profile) return { error: "The user must sign in to see bookings." };
  const { data } = await ctx.supabase
    .from("bookings")
    .select("id, status, start_time, end_time, total_price, location:parking_locations(name)")
    .eq("user_id", ctx.profile.id)
    .neq("status", "pending_payment")
    .order("start_time", { ascending: false })
    .limit(10);
  return {
    bookings: (data ?? []).map((b) => ({
      id: b.id,
      status: b.status,
      location: (b.location as unknown as { name: string } | null)?.name,
      starts: dateTime(b.start_time),
      ends: dateTime(b.end_time),
      total: money(Number(b.total_price)),
    })),
  };
}

async function toolProposeBooking(ctx: Ctx, args: Args) {
  if (!ctx.profile) return { error: "The user must sign in before booking." };
  const { data: loc } = await ctx.supabase.from("parking_locations").select("id, name, hourly_price").eq("id", String(args.location_id)).maybeSingle();
  if (!loc) return { error: "Location not found" };
  let start = new Date(String(args.start_time));
  if (Number.isNaN(start.getTime()) || start < new Date(Date.now() - 10 * 60_000)) start = roundUp5(new Date());
  const hours = Math.min(24, Math.max(0.5, num(args.duration_hours) ?? 2));
  const end = new Date(start.getTime() + hours * 3_600_000);
  const price = priceBreakdown(Number(loc.hourly_price), start, end);
  ctx.actions.push({
    type: "book",
    location_id: loc.id,
    location_name: loc.name,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    vehicle_plate: str(args.vehicle_plate) ?? ctx.profile.vehicle_plate,
    total: price.total,
    hours,
  });
  return { prepared: true, needs_user_confirmation: true, location: loc.name, starts: dateTime(start.toISOString()), hours, total: money(price.total) };
}

async function toolProposeExtension(ctx: Ctx, bookingId: string, minutes: number) {
  if (!ctx.profile) return { error: "The user must sign in." };
  const { data: b } = await ctx.supabase.from("bookings").select("*, location:parking_locations(name, hourly_price)").eq("id", bookingId).eq("user_id", ctx.profile.id).maybeSingle();
  if (!b) return { error: "Booking not found" };
  if (!["upcoming", "active"].includes(b.status)) return { error: `A ${b.status} booking can't be extended` };
  const loc = b.location as { name: string; hourly_price: number };
  const mins = Math.min(720, Math.max(15, Math.round(minutes || 60)));
  const oldEnd = new Date(b.end_time);
  const newEnd = new Date(oldEnd.getTime() + mins * 60_000);
  const amount = priceBreakdown(Number(loc.hourly_price), oldEnd, newEnd).subtotal;
  ctx.actions.push({ type: "extend", booking_id: b.id, location_name: loc.name, minutes: mins, new_end_time: newEnd.toISOString(), amount });
  return { prepared: true, needs_user_confirmation: true, new_end: dateTime(newEnd.toISOString()), amount: money(amount) };
}

async function toolProposeCancel(ctx: Ctx, bookingId: string) {
  if (!ctx.profile) return { error: "The user must sign in." };
  const { data: b } = await ctx.supabase.from("bookings").select("*, location:parking_locations(name)").eq("id", bookingId).eq("user_id", ctx.profile.id).maybeSingle();
  if (!b) return { error: "Booking not found" };
  if (!["pending_payment", "upcoming", "active"].includes(b.status)) return { error: `A ${b.status} booking can't be cancelled` };
  const refund = refundFor({ ...(b as Booking), total_price: Number(b.total_price) });
  ctx.actions.push({ type: "cancel", booking_id: b.id, location_name: (b.location as { name: string }).name, refund: refund.amount, rule: refund.rule });
  return { prepared: true, needs_user_confirmation: true, refund: money(refund.amount), policy: refund.rule };
}

function roundUp5(d: Date) {
  const ms = 5 * 60_000;
  return new Date(Math.ceil(d.getTime() / ms) * ms);
}

/** Without an LLM: treat the message as a search and answer with the results. */
async function rulesAssistant(ctx: Ctx, messages: ChatMessage[]): Promise<AssistantReply> {
  const last = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const parsed = ruleParse(last);
  const out = await toolSearch(ctx, {
    place: parsed.place ?? undefined,
    duration_hours: parsed.duration_hours,
    max_price_per_hour: parsed.max_price_per_hour ?? undefined,
    max_total_price: parsed.max_total_price ?? undefined,
    covered: parsed.covered ?? undefined,
    ev_charging: parsed.ev_charging ?? undefined,
    accessible: parsed.accessible ?? undefined,
    sort: parsed.sort,
  });
  if ("error" in out) return { reply: `${out.error}. Try a street name or landmark.`, actions: [], cards: [], engine: "rules" };
  const best = out.results[0];
  return {
    reply: best
      ? `Top option near ${out.searched_near}: ${best.name} at ${money(best.hourly_price)}/hr — ${best.why}. (Basic mode: add an OpenAI key for full conversations, booking and cancellations by chat.)`
      : `I couldn't find parking near ${out.searched_near} with those filters.`,
    actions: [],
    cards: ctx.cards,
    engine: "rules",
  };
}
