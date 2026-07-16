import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "react-image-crop/dist/ReactCrop.css";
import "./globals.css";

const GOOGLE_ANALYTICS_ID = "G-21TCS1LSCC";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "700", "900"],
});

export const metadata: Metadata = {
  title: "MMMRED",
  description: "Privátní streamovací platforma autorských kolekcí.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "64x64" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: ["/favicon.ico"],
    apple: [{ url: "/apple-icon", sizes: "180x180" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="cs" className={inter.variable}>
      <body>
        <Script id="ga-consent-default" strategy="beforeInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('consent', 'default', {
              ad_storage: 'granted',
              analytics_storage: 'granted',
              functionality_storage: 'granted',
              personalization_storage: 'granted',
              security_storage: 'granted',
              ad_user_data: 'granted',
              ad_personalization: 'granted'
            });
          `}
        </Script>
        <Script
          id="ga-loader"
          src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga-config" strategy="afterInteractive">
          {`
            gtag('js', new Date());
            gtag('config', '${GOOGLE_ANALYTICS_ID}');
          `}
        </Script>
        {children}
      </body>
    </html>
  );
}
