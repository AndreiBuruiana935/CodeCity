import type { Metadata } from "next";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import { AppProvider } from "@/components/AppContext";

export const metadata: Metadata = {
  title: "CodeAtlas",
  description:
    "Transform any GitHub repository into an interactive architecture graph that reveals structure, risk, and dependencies at a glance.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <AppProvider>{children}</AppProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
