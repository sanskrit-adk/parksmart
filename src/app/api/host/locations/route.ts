import { ApiError, handler, ok, parseJson, requireUser } from "@/lib/api";
import { timezoneAt } from "@/lib/osm";
import { listingSchema } from "@/lib/schemas";

/** Create a host listing. Drivers become hosts on their first listing. */
export const POST = handler(async (req: Request) => {
  const body = await parseJson(req, listingSchema);
  const { supabase, profile } = await requireUser();

  if (profile.role === "driver") {
    const { error } = await supabase.from("profiles").update({ role: "host" }).eq("id", profile.id);
    if (error) throw new ApiError(500, "Could not enable hosting on your account");
  }

  const { lat, lng, ...rest } = body;
  const { data, error } = await supabase
    .from("parking_locations")
    .insert({
      ...rest,
      host_id: profile.id,
      source: "host",
      geom: `SRID=4326;POINT(${lng} ${lat})`,
      timezone: timezoneAt(lat, lng),
      city: rest.city || null,
      description: rest.description || null,
    })
    .select("*")
    .single();
  if (error) {
    console.error(error);
    throw new ApiError(400, "Could not create the listing. Check the details and try again.");
  }
  return ok({ location: data }, { status: 201 });
});
