import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Navbar from "../components/Navbar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://cryptodailyink.com";

export const metadata: Metadata = {
  title: "CryptoDailyInk | Breaking Market Alpha, On-Chain Signals & Crypto News",
  description:
    "Master the markets with Cryptodailyink.com. Real-time Alpha on Bitcoin, Ethereum, and Altcoins. Get expert on-chain analysis, institutional flow tracking, and breaking DeFi updates.",
  keywords: [
    "crypto market alpha",
    "real-time crypto signals",
    "bitcoin institutional news",
    "on-chain data analysis",
    "ethereum price action",
    "defi protocol updates",
    "cryptodailyink alpha",
    "solana ecosystem news",
  ],
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "CryptoDailyInk | Breaking Market Alpha & Crypto News",
    description:
      "Real-time Alpha on Bitcoin, Ethereum, and Altcoins. Expert on-chain analysis, institutional flow tracking, and breaking DeFi updates.",
    url: SITE_URL,
    siteName: "CryptoDailyInk",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "CryptoDailyInk | Breaking Market Alpha & Crypto News",
    description:
      "Real-time Alpha on Bitcoin, Ethereum, and Altcoins. Expert on-chain analysis and breaking DeFi updates.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Google Tag Manager */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-W487C2N3');`,
          }}
        />
        {/* End Google Tag Manager */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,300;0,400;0,500;0,700;0,900;1,300;1,400;1,700&family=Roboto+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ background: "#f5f4f1" }}
      >
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-W487C2N3"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        {/* End Google Tag Manager (noscript) */}
        {/* JSON-LD: Organization + WebSite schema */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": ["Organization", "NewsMediaOrganization"],
                  "@id": `${SITE_URL}/#organization`,
                  name: "CryptoDailyInk",
                  url: SITE_URL,
                  description:
                    "High-frequency digital newsroom delivering real-time market intelligence, on-chain data analysis, and breaking updates across the global blockchain ecosystem.",
                  foundingDate: "2025",
                  sameAs: [],
                  publishingPrinciples: `${SITE_URL}/about`,
                },
                {
                  "@type": "WebSite",
                  "@id": `${SITE_URL}/#website`,
                  url: SITE_URL,
                  name: "CryptoDailyInk",
                  publisher: { "@id": `${SITE_URL}/#organization` },
                  potentialAction: {
                    "@type": "SearchAction",
                    target: {
                      "@type": "EntryPoint",
                      urlTemplate: `${SITE_URL}/?q={search_term_string}`,
                    },
                    "query-input": "required name=search_term_string",
                  },
                },
              ],
            }),
          }}
        />
        <Navbar />
        {children}
      </body>
    </html>
  );
}
