"use client";

import { BellIcon, CheckCheckIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { relativeTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/lib/types";
import { cn } from "@/lib/utils";

export function NotificationsBell({ userId }: { userId: string }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [marking, setMarking] = useState(false);
  const unread = items.filter((n) => !n.read_at).length;

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setItems((data as Notification[]) ?? []));

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const n = payload.new as Notification;
          setItems((prev) => [n, ...prev].slice(0, 20));
          toast(n.title, { description: n.body ?? undefined });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  async function markAllRead() {
    setMarking(true);
    const ids = items.filter((n) => !n.read_at).map((n) => n.id);
    const { error } = await createClient().from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
    setMarking(false);
    if (error) {
      toast.error("Couldn't update notifications");
      return;
    }
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} />
        }
      >
        <BellIcon className="size-5" />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-full text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="font-semibold">Notifications</p>
          <Button variant="ghost" size="xs" onClick={markAllRead} loading={marking} disabled={!unread}>
            <CheckCheckIcon /> Mark all read
          </Button>
        </div>
        <ul className="max-h-96 overflow-y-auto">
          {items.length === 0 && <li className="px-4 py-10 text-center text-sm text-muted-foreground">You&apos;re all caught up.</li>}
          {items.map((n) => (
            <li key={n.id}>
              <Link
                href={n.link ?? "/bookings"}
                onClick={() => setOpen(false)}
                className={cn("flex gap-3 px-4 py-3 text-sm hover:bg-muted", !n.read_at && "bg-accent/50")}
              >
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-teal-strong")} />
                <span className="min-w-0">
                  <span className="block font-medium">{n.title}</span>
                  {n.body && <span className="block text-muted-foreground">{n.body}</span>}
                  <span className="mt-0.5 block text-xs text-muted-foreground">{relativeTime(n.created_at)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
