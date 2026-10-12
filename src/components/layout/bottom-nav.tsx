"use client";

import { CalendarCheckIcon, HomeIcon, MapIcon, UserIcon, WarehouseIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/components/providers";
import { cn } from "@/lib/utils";

/** Mobile bottom navigation — thumb-reachable primary destinations. */
export function BottomNav() {
  const pathname = usePathname();
  const { profile } = useSession();
  const items = [
    { href: "/", label: "Home", icon: HomeIcon, exact: true },
    { href: "/find", label: "Find", icon: MapIcon },
    { href: "/bookings", label: "Bookings", icon: CalendarCheckIcon },
    { href: "/host", label: "Host", icon: WarehouseIcon },
    { href: profile ? "/profile" : "/login", label: profile ? "Profile" : "Log in", icon: UserIcon },
  ];
  return (
    <nav
      aria-label="Primary"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/90 backdrop-blur-xl md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {items.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors",
                  active && "text-foreground",
                )}
              >
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-teal/25 text-teal-strong")}>
                  <Icon className="size-5" aria-hidden />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
