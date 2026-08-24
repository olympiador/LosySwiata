import type { Metadata } from "next";
import "./globals.css";
import { APP_VERSION } from "./app-version";

export const metadata: Metadata = {
  title: "Losy Świata",
  applicationName: "Losy Świata",
  description: "Interaktywny symulator wojen, powstawania lądu i erozji na politycznej mapie świata.",
  other: {
    "codex-preview": "development",
    "losy-swiata-version": APP_VERSION,
  },
  manifest: "/manifest.json",
  themeColor: "#0d2632",
  appleWebApp: {
    capable: true,
    title: "Losy Świata",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
