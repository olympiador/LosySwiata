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
