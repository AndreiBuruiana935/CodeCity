import type { Metadata } from "next";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import { AppProvider } from "@/components/AppContext";

export const metadata: Metadata = {
  title: "CodeCity",
  description:
    "Transform any GitHub repository into a living, interactive city where architecture becomes geography.",
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
