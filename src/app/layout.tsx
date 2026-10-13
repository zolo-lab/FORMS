import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const heebo = Heebo({ subsets: ["hebrew", "latin"], variable: "--font-heebo", display: "swap" });

// Handwriting face for typed signatures (OFL, see ./fonts/OFL-GveretLevin.txt).
const signatureFont = localFont({ src: "./fonts/GveretLevin-Regular.ttf", variable: "--font-signature", display: "swap", preload: false });

export const metadata: Metadata = {
  title: "טפסים וחתימות",
  description: "מערכת קליטה, טפסים וחתימות דיגיטליות",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} ${signatureFont.variable}`}>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">{children}</body>
    </html>
  );
}
