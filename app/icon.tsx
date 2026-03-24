import { ImageResponse } from "next/og"

export const runtime = "edge"
export const size = { width: 32, height: 32 }
export const contentType = "image/png"

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 7,
          background: "#1B4F8A",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          padding: 3,
        }}
      >
        {[1, 0.4, 1, 0.4, 1, 0.4, 1, 0.4, 1].map((opacity, i) => (
          <div
            key={i}
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: `rgba(255,255,255,${opacity})`,
            }}
          />
        ))}
      </div>
    ),
    { ...size }
  )
}
