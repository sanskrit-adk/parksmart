import { ApiError, handler, ok, requireUser } from "@/lib/api";
import { detectSpaces } from "@/lib/ai/detection";
import { fetchSnapshot, readImageField } from "@/lib/images";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 60;

/**
 * Host/admin uploads a lot photo (or a camera snapshot URL). We count free vs
 * occupied spaces, store the annotated detection, and the DB trigger turns
 * the location's availability "Live" for the next 30 minutes.
 */
export const POST = handler(async (req: Request) => {
  const { profile } = await requireUser(["host", "admin"]);
  const form = await req.formData().catch(() => {
    throw new ApiError(400, "Send the image as multipart/form-data");
  });
  const locationId = String(form.get("location_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(locationId)) throw new ApiError(400, "Choose a location");

  const admin = createAdminClient();
  const { data: location } = await admin.from("parking_locations").select("id, host_id, total_spots, name").eq("id", locationId).maybeSingle();
  if (!location || (profile.role !== "admin" && location.host_id !== profile.id)) throw new ApiError(404, "Location not found");

  const snapshotUrl = String(form.get("camera_url") ?? "").trim();
  const image = (await readImageField(form)) ?? (snapshotUrl ? await fetchSnapshot(snapshotUrl) : null);
  if (!image) throw new ApiError(400, "Upload a photo or provide a camera snapshot URL");

  const result = await detectSpaces(image.bytes, image.type, location.total_spots <= 300 ? location.total_spots : undefined);

  const ext = image.type === "image/png" ? "png" : image.type === "image/webp" ? "webp" : "jpg";
  const path = `${locationId}/${Date.now()}.${ext}`;
  const { error: uploadError } = await admin.storage.from("detections").upload(path, image.bytes, { contentType: image.type });
  if (uploadError) throw new ApiError(500, "Could not store the image");
  const imageUrl = admin.storage.from("detections").getPublicUrl(path).data.publicUrl;

  const { data: detection, error } = await admin
    .from("ai_detections")
    .insert({
      location_id: locationId,
      image_url: imageUrl,
      free_count: result.free_count,
      occupied_count: result.occupied_count,
      boxes: result.boxes,
      image_width: result.width,
      image_height: result.height,
      model: `${result.engine}:${result.model}`,
      created_by: profile.id,
    })
    .select("*")
    .single();
  if (error) throw new ApiError(500, "Could not save the detection");

  const { data: updated } = await admin.from("parking_locations").select("available_now, availability_mode").eq("id", locationId).single();
  return ok({ detection, engine: result.engine, location: { name: location.name, ...updated } });
});
