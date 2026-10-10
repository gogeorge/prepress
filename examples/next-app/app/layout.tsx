import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "@crasi/prepress example",
  description: "One label in two locales with preflight and PDF export.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
