import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Glitch — learn smarter, not harder",
  description: "Adaptive learning with Byte, your friendly AI tutor.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
