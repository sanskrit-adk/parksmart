import { handler, ok, parseJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { filtersSchema } from "@/lib/schemas";
import { DEFAULT_FILTERS, searchParking } from "@/lib/search";

/** Structured search (filter panel, map "search this area"). */
export const POST = handler(async (req: Request) => {
  const filters = await parseJson(req, filtersSchema);
  const { supabase, profile } = await getSession();
  const { results, widened } = await searchParking(supabase, { ...DEFAULT_FILTERS, ...filters }, profile?.preferences);
  return ok({ results, widened });
});
