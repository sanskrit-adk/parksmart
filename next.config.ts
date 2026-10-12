import type { NextConfig } from "next";

const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return "*.supabase.co";
  }
})();

const nextConfig: NextConfig = {
  // Tailwind CSS v4 via its Turbopack loader (no PostCSS config needed).
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" },
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
      { protocol: "https", hostname: "api.mapbox.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
