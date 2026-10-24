import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VOOM SYSTEM | Nova AI",
  description: "VOOM SYSTEM Nova AI research and paper-trading dashboard.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
