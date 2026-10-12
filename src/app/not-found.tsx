import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <EmptyState
      art="map"
      title="This page took a wrong turn"
      description="The page or parking spot you're looking for doesn't exist or was removed."
      className="flex-1 py-24"
      action={
        <div className="flex gap-2">
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Home
          </Link>
          <Link href="/find" className={buttonVariants({ variant: "teal" })}>
            Find parking
          </Link>
        </div>
      }
    />
  );
}
