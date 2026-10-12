export type UserRole = "driver" | "host" | "admin";
export type LocationType = "garage" | "lot" | "street" | "private";
export type LocationSource = "osm" | "sfmta" | "host";
export type AvailabilityMode = "live" | "estimated";
export type BookingStatus = "pending_payment" | "upcoming" | "active" | "completed" | "cancelled";

export type OpeningHours =
  | { always: true }
  | Partial<Record<DayKey, [string, string][]>>;
export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface UserPreferences {
  prefer_covered?: boolean;
  prefer_ev?: boolean;
  need_accessible?: boolean;
  max_walk_minutes?: number;
  price_sensitivity?: "low" | "medium" | "high";
}

export interface Profile {
  id: string;
  name: string | null;
  phone: string | null;
  role: UserRole;
  vehicle_plate: string | null;
  avatar_url: string | null;
  preferences: UserPreferences;
  created_at: string;
}

export interface Vehicle {
  id: string;
  user_id: string;
  plate: string;
  label: string | null;
  is_default: boolean;
  created_at: string;
}

export interface ParkingLocation {
  id: string;
  host_id: string | null;
  external_id: string | null;
  name: string;
  address: string | null;
  city: string | null;
  description: string | null;
  lat: number;
  lng: number;
  type: LocationType;
  covered: boolean;
  ev_charging: boolean;
  accessible: boolean;
  total_spots: number;
  capacity_estimated: boolean;
  hourly_price: number;
  price_estimated: boolean;
  photos: string[];
  rating: number | null;
  review_count: number;
  source: LocationSource;
  opening_hours: OpeningHours | null;
  timezone: string;
  blackout_dates: string[];
  is_active: boolean;
  available_now: number | null;
  availability_mode: AvailabilityMode | null;
  occupancy_rate: number | null;
  availability_updated_at: string | null;
  created_at: string;
}

/** Row returned by the nearby_locations() RPC. */
export interface NearbyLocation {
  id: string;
  name: string;
  address: string | null;
  type: LocationType;
  covered: boolean;
  ev_charging: boolean;
  accessible: boolean;
  total_spots: number;
  capacity_estimated: boolean;
  hourly_price: number;
  price_estimated: boolean;
  photos: string[];
  rating: number | null;
  review_count: number;
  source: LocationSource;
  opening_hours: OpeningHours | null;
  is_open: boolean | null;
  available_now: number | null;
  availability_mode: AvailabilityMode | null;
  lat: number;
  lng: number;
  distance_m: number;
  predicted_rate: number;
  free_probability: number;
}

/** A search result after AI ranking. */
export interface RankedLocation extends NearbyLocation {
  score: number;
  ai_pick: boolean;
  reason: string;
  walk_minutes: number;
  estimated_total: number;
}

/** Row returned by locations_in_bounds() — what the map draws. */
export interface MapLocation {
  id: string;
  name: string;
  type: LocationType;
  hourly_price: number;
  price_estimated: boolean;
  total_spots: number;
  available_now: number | null;
  availability_mode: AvailabilityMode | null;
  lat: number;
  lng: number;
}

export interface PriceBreakdown {
  hours: number;
  hourly_price: number;
  subtotal: number;
  service_fee: number;
  total: number;
}

export interface Booking {
  id: string;
  user_id: string;
  spot_id: string;
  location_id: string;
  start_time: string;
  end_time: string;
  status: BookingStatus;
  total_price: number;
  price_breakdown: PriceBreakdown;
  vehicle_plate: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_id: string | null;
  qr_code: string;
  hold_expires_at: string | null;
  checked_in_at: string | null;
  refund_amount: number | null;
  cancelled_at: string | null;
  created_at: string;
}

export interface BookingWithLocation extends Booking {
  location: Pick<ParkingLocation, "id" | "name" | "address" | "type" | "hourly_price" | "timezone" | "photos"> & {
    lat: number;
    lng: number;
  };
  spot: { label: string };
  has_review?: boolean;
}

export interface Review {
  id: string;
  user_id: string;
  location_id: string;
  booking_id: string | null;
  author_name: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface DetectionBox {
  x: number; // 0..1, relative to image width
  y: number;
  w: number;
  h: number;
  label: "occupied" | "free";
  confidence: number;
}

export interface AiDetection {
  id: string;
  location_id: string;
  image_url: string;
  free_count: number;
  occupied_count: number;
  boxes: DetectionBox[];
  image_width: number | null;
  image_height: number | null;
  model: string;
  created_at: string;
}

export interface ForecastPoint {
  ts: string;
  occupancy_rate: number;
  free_probability: number;
}

export interface Notification {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

/** Structured filters produced by the AI search parser. */
export interface SearchFilters {
  place: string | null;
  lat: number | null;
  lng: number | null;
  radius_m: number;
  duration_hours: number;
  arrive_at: string | null;
  max_price_per_hour: number | null;
  max_total_price: number | null;
  covered: boolean | null;
  ev_charging: boolean | null;
  accessible: boolean | null;
  open_now: boolean;
  types: LocationType[] | null;
  sort: "best" | "price" | "distance" | "availability";
}
