"use client";

import { CarIcon, LayoutDashboardIcon, LogOutIcon, ScanLineIcon, UserIcon, WarehouseIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NotificationsBell } from "@/components/layout/notifications-bell";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Logo } from "@/components/logo";
import { useSession } from "@/components/providers";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function SiteHeader() {
  const { profile, email } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  const links = [
    { href: "/find", label: "Find parking" },
    { href: "/bookings", label: "My bookings", auth: true },
    { href: "/host", label: profile?.role === "host" || profile?.role === "admin" ? "Host dashboard" : "List your space" },
    ...(profile?.role === "admin" ? [{ href: "/admin", label: "Admin" }] : []),
  ].filter((l) => !l.auth || profile);

  const initials = (profile?.name ?? email ?? "?").slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl supports-backdrop-filter:bg-background/70">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="ParkSmart home" className="rounded-lg">
          <Logo />
        </Link>
        <nav aria-label="Main" className="ml-6 hidden items-center gap-1 md:flex">
          {links.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  active && "bg-muted text-foreground",
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          {profile ? (
            <>
              <NotificationsBell userId={profile.id} />
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Account menu"
                  className="ml-1 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Avatar className="size-9">
                    {profile.avatar_url && <AvatarImage src={profile.avatar_url} alt="" />}
                    <AvatarFallback className="bg-navy text-xs font-semibold text-white dark:bg-teal dark:text-navy">{initials}</AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>
                      <span className="block truncate font-semibold text-foreground">{profile.name ?? "Your account"}</span>
                      <span className="block truncate text-xs font-normal">{email}</span>
                    </DropdownMenuLabel>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push("/profile")}>
                    <UserIcon /> Profile & vehicles
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push("/bookings")}>
                    <CarIcon /> My bookings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push("/check-in")}>
                    <ScanLineIcon /> Plate check-in
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push("/host")}>
                    <WarehouseIcon /> {profile.role === "driver" ? "List your space" : "Host dashboard"}
                  </DropdownMenuItem>
                  {profile.role === "admin" && (
                    <DropdownMenuItem onClick={() => router.push("/admin")}>
                      <LayoutDashboardIcon /> Admin
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={async () => {
                      const { error } = await createClient().auth.signOut();
                      if (error) {
                        toast.error("Couldn't sign out. Please try again.");
                        return;
                      }
                      toast.success("Signed out");
                      router.push("/");
                      router.refresh();
                    }}
                  >
                    <LogOutIcon /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Link href={`/login?next=${encodeURIComponent(pathname)}`} className={cn(buttonVariants({ variant: "ghost" }), "hidden sm:inline-flex")}>
                Log in
              </Link>
              <Link href="/signup" className={buttonVariants()}>
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
