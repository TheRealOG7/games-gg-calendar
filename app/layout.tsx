import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Gaming Calendar | GAMES.GG",
  description: "Upcoming game releases, gaming events, conventions, and more — all in one place.",
  openGraph: {
    title: "Gaming Calendar | GAMES.GG",
    description: "Upcoming game releases, gaming events, conventions, and more.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
