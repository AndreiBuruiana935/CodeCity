import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CodeCity — Visualize Any Codebase in 3D",
  description:
    "Transform any GitHub repository into a living, interactive 3D city where architecture becomes geography.",
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
