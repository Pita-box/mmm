import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "react-image-crop/dist/ReactCrop.css";
import "./globals.css";
import { getSessionPrincipalReadOnly } from "@/lib/session";

const GOOGLE_TAG_MANAGER_ID = "GTM-MTKZ9V3D";

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

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const principal = await getSessionPrincipalReadOnly();
  const shouldTrack =
    principal === null || (principal.role !== "Admin" && principal.role !== "Distributor");

  return (
    <html lang="cs" className={inter.variable}>
      <body>
        {shouldTrack ? (
          <>
            <Script id="gtm-consent-default" strategy="beforeInteractive">
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
            <Script id="gtm-loader" strategy="afterInteractive">
              {`
                (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
                new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
                j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
                'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
                })(window,document,'script','dataLayer','${GOOGLE_TAG_MANAGER_ID}');
              `}
            </Script>
            <noscript>
              <iframe
                src={`https://www.googletagmanager.com/ns.html?id=${GOOGLE_TAG_MANAGER_ID}`}
                height="0"
                width="0"
                style={{ display: "none", visibility: "hidden" }}
              />
            </noscript>
          </>
        ) : null}
        {children}
      </body>
    </html>
  );
}
