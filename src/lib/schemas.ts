import { z } from "zod";

export const filtersSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radius_m: z.number().int().min(100).max(20000).default(2000),
  duration_hours: z.number().min(0.5).max(24).default(2),
  arrive_at: z.string().datetime({ offset: true }).nullable().default(null),
  max_price_per_hour: z.number().positive().nullable().default(null),
  max_total_price: z.number().positive().nullable().default(null),
  covered: z.boolean().nullable().default(null),
  ev_charging: z.boolean().nullable().default(null),
  accessible: z.boolean().nullable().default(null),
  open_now: z.boolean().default(false),
  types: z.array(z.enum(["garage", "lot", "street", "private"])).nullable().default(null),
  sort: z.enum(["best", "price", "distance", "availability"]).default("best"),
});

const time = /^([01]\d|2[0-3]):[0-5]\d$/;
const range = z.tuple([z.string().regex(time), z.string().regex(time)]);

export const openingHoursSchema = z.union([
  z.object({ always: z.literal(true) }),
  z.object({
    mon: z.array(range).optional(),
    tue: z.array(range).optional(),
    wed: z.array(range).optional(),
    thu: z.array(range).optional(),
    fri: z.array(range).optional(),
    sat: z.array(range).optional(),
    sun: z.array(range).optional(),
  }),
]);

export const listingSchema = z.object({
  name: z.string().trim().min(3, "Give your space a name").max(80),
  description: z.string().trim().max(1000).optional().default(""),
  address: z.string().trim().min(5, "Address is required").max(200),
  city: z.string().trim().max(80).optional().default(""),
  lat: z.number().min(36.5).max(38.9, "We currently support the SF Bay Area"),
  lng: z.number().min(-123.6).max(-121.0, "We currently support the SF Bay Area"),
  type: z.enum(["garage", "lot", "private"]),
  covered: z.boolean(),
  ev_charging: z.boolean(),
  accessible: z.boolean(),
  total_spots: z.number().int().min(1).max(500),
  hourly_price: z.number().min(0).max(100),
  photos: z.array(z.string().url()).max(8).default([]),
  opening_hours: openingHoursSchema,
  blackout_dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(366).default([]),
});

export const plateSchema = z
  .string()
  .transform((s) => s.toUpperCase().replace(/[^A-Z0-9]/g, ""))
  .pipe(z.string().regex(/^[A-Z0-9]{2,8}$/, "Plates are 2–8 letters or digits"));
