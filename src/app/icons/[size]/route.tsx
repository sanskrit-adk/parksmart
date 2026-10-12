import { ImageResponse } from "next/og";

/** PNG app icons generated at build time (192, 512 and a maskable 512). */
export function generateStaticParams() {
  return [{ size: "192" }, { size: "512" }, { size: "maskable" }];
}

export async function GET(_req: Request, ctx: RouteContext<"/icons/[size]">) {
  const { size } = await ctx.params;
  const maskable = size === "maskable";
  const px = size === "192" ? 192 : 512;
  const pad = maskable ? px * 0.2 : 0;
  const inner = px - pad * 2;
  return new ImageResponse(
    (
      <div style={{ width: px, height: px, display: "flex", alignItems: "center", justifyContent: "center", background: "#152a5c" }}>
        <div
          style={{
            width: inner,
            height: inner,
            borderRadius: maskable ? 0 : inner * 0.22,
            background: "#152a5c",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          <div style={{ color: "white", fontSize: inner * 0.62, fontWeight: 800, fontFamily: "sans-serif", lineHeight: 1 }}>P</div>
          <div
            style={{
              position: "absolute",
              top: inner * 0.16,
              right: inner * 0.18,
              width: inner * 0.2,
              height: inner * 0.2,
              borderRadius: inner,
              background: "#5ee0d2",
            }}
          />
        </div>
      </div>
    ),
    { width: px, height: px },
  );
}
