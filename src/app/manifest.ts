import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ParkSmart — AI parking",
    short_name: "ParkSmart",
    description: "Find, predict and book parking in the Bay Area with AI.",
    start_url: "/find?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f9fc",
    theme_color: "#152a5c",
    categories: ["navigation", "travel", "utilities"],
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Find parking near me", url: "/find", icons: [{ src: "/icons/192", sizes: "192x192" }] },
      { name: "My bookings", url: "/bookings", icons: [{ src: "/icons/192", sizes: "192x192" }] },
      { name: "Plate check-in", url: "/check-in", icons: [{ src: "/icons/192", sizes: "192x192" }] },
    ],
  };
}
