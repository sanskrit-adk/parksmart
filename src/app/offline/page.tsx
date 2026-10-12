import { EmptyState } from "@/components/empty-state";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <EmptyState
      art="map"
      title="You're offline"
      description="Reconnect to search and book parking. Bookings you've opened recently, including QR codes, are still available."
      className="flex-1 py-24"
    />
  );
}
