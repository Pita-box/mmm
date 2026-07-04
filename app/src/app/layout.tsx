import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "react-image-crop/dist/ReactCrop.css";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "700", "900"],
});

export const metadata: Metadata = {
  title: "MMMRED",
  description: "Privátní streamovací platforma autorských kolekcí.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="cs" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
