"use client";

import { RefreshCwIcon } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <EmptyState
      art="search"
      title="Something went wrong"
      description="We hit an unexpected problem loading this page. Please try again."
      className="flex-1 py-24"
      action={
        <div className="flex gap-2">
          <Button onClick={reset}>
            <RefreshCwIcon /> Try again
          </Button>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Home
          </Link>
        </div>
      }
    />
  );
}
