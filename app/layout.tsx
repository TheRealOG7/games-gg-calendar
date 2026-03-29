import type { Metadata, Viewport } from "next";
import "./globals.css";

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
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
