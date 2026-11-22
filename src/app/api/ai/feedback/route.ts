import { z } from "zod";
import { ApiError, handler, ok, parseJson, requireUser } from "@/lib/api";
import { summarizeFeedback, type FeedbackInput } from "@/lib/ai/feedback";

/**
 * GenAI customer-feedback summary. Admins summarise every review (or one
 * location); hosts summarise reviews of their own listings only.
 */
export const POST = handler(async (req: Request) => {
  const { location_id, days } = await parseJson(
    req,
    z.object({ location_id: z.string().regex(/^[0-9a-f-]{36}$/i, "Invalid listing").optional(), days: z.number().int().min(1).max(365).optional() }),
  );
  const { supabase, profile } = await requireUser(["host", "admin"]);

  let locationIds: string[] | null = null;
  if (location_id) {
    const { data: loc } = await supabase.from("parking_locations").select("id, host_id").eq("id", location_id).maybeSingle();
    if (!loc) throw new ApiError(404, "Listing not found");
    if (profile.role !== "admin" && loc.host_id !== profile.id) throw new ApiError(403, "You can only summarise feedback for your own listings");
    locationIds = [location_id];
  } else if (profile.role !== "admin") {
    const { data: mine } = await supabase.from("parking_locations").select("id").eq("host_id", profile.id);
    locationIds = (mine ?? []).map((l) => l.id as string);
  }

  let query = supabase
    .from("reviews")
    .select("rating, comment, created_at, location:parking_locations(name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (locationIds) query = locationIds.length ? query.in("location_id", locationIds) : query.eq("location_id", "00000000-0000-0000-0000-000000000000");
  if (days) query = query.gte("created_at", new Date(Date.now() - days * 86_400_000).toISOString());
  const { data, error } = await query;
  if (error) throw new ApiError(500, "Could not load reviews");

  const reviews: FeedbackInput[] = (data ?? []).map((r) => {
    const loc = r.location as unknown as { name: string } | null;
    return { rating: r.rating as number, comment: (r.comment as string | null) ?? null, created_at: r.created_at as string, location: loc?.name ?? null };
  });
  const scope = location_id ? "one parking listing" : profile.role === "admin" ? "all ParkSmart locations" : "this host's listings";
  const result = await summarizeFeedback(reviews, scope);
  return ok({ ...result, real_review_count: reviews.length, generated_at: new Date().toISOString() });
});
