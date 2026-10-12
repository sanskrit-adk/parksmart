"use client";

import { NavigationIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { directionsLinks } from "@/lib/geo";

/** Opens turn-by-turn navigation in Google Maps or Apple Maps (native apps on mobile). */
export function DirectionsButton({
  lat,
  lng,
  label,
  variant = "outline",
  size = "default",
  className,
}: {
  lat: number;
  lng: number;
  label?: string;
  variant?: "outline" | "default" | "teal" | "secondary";
  size?: "default" | "lg" | "sm";
  className?: string;
}) {
  const links = directionsLinks({ lat, lng }, label);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant={variant} size={size} className={className} />}>
        <NavigationIcon /> Directions
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={() => window.open(links.google, "_blank", "noopener")}>Google Maps</DropdownMenuItem>
        <DropdownMenuItem onClick={() => window.open(links.apple, "_blank", "noopener")}>Apple Maps</DropdownMenuItem>
        <DropdownMenuItem onClick={() => window.open(links.walkingGoogle, "_blank", "noopener")}>Walking route</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
