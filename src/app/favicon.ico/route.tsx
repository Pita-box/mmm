import { ImageResponse } from "next/og";

export const runtime = "nodejs";

export async function GET() {
  const response = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#000000",
          color: "#f71412",
          fontSize: 44,
          fontWeight: 900,
          letterSpacing: 0,
          borderRadius: 14,
        }}
      >
        MMMRED
      </div>
    ),
    { width: 64, height: 64 },
  );

  return new Response(await response.arrayBuffer(), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
