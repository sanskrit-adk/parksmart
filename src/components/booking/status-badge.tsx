import { Badge } from "@/components/ui/badge";
import type { BookingStatus } from "@/lib/types";

const MAP: Record<BookingStatus, { label: string; variant: "free" | "filling" | "full" | "secondary" | "teal" }> = {
  pending_payment: { label: "Awaiting payment", variant: "filling" },
  upcoming: { label: "Upcoming", variant: "teal" },
  active: { label: "Active", variant: "free" },
  completed: { label: "Completed", variant: "secondary" },
  cancelled: { label: "Cancelled", variant: "full" },
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const s = MAP[status];
  return (
    <Badge variant={s.variant} className="h-6 px-2.5">
      {s.label}
    </Badge>
  );
}
