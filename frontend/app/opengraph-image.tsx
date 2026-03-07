import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "CryptoDailyInk — Breaking Market Alpha & Crypto News";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 50%, #16213e 100%)",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background grid pattern */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
            display: "flex",
          }}
        />

        {/* Accent glow */}
        <div
          style={{
            position: "absolute",
            top: "-100px",
            right: "-100px",
            width: "400px",
            height: "400px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,107,0,0.15) 0%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* Brand logo */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            marginBottom: "24px",
          }}
        >
          <span
            style={{
              fontSize: "72px",
              fontWeight: 900,
              color: "#ffffff",
              letterSpacing: "-2px",
            }}
          >
            CryptoDaily
          </span>
          <span
            style={{
              fontSize: "72px",
              fontWeight: 900,
              color: "#ff6b00",
              letterSpacing: "-2px",
            }}
          >
            Ink
          </span>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: "28px",
            fontWeight: 500,
            color: "rgba(255,255,255,0.75)",
            letterSpacing: "0.5px",
            textAlign: "center",
            maxWidth: "800px",
            display: "flex",
          }}
        >
          Breaking Market Alpha · On-Chain Signals · Crypto News
        </div>

        {/* Divider */}
        <div
          style={{
            width: "120px",
            height: "3px",
            background: "linear-gradient(90deg, transparent, #ff6b00, transparent)",
            margin: "32px 0",
            display: "flex",
          }}
        />

        {/* Sub text */}
        <div
          style={{
            fontSize: "20px",
            fontWeight: 400,
            color: "rgba(255,255,255,0.5)",
            display: "flex",
          }}
        >
          Real-time intelligence for the blockchain ecosystem
        </div>

        {/* Bottom bar */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "4px",
            background: "linear-gradient(90deg, #ff6b00, #ff9a44, #ff6b00)",
            display: "flex",
          }}
        />
      </div>
    ),
    { ...size }
  );
}
