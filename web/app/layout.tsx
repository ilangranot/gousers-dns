import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "GoUsers AI Gateway",
  description: "Your organization's AI portal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <html lang="en">
        <body>
          <ThemeProvider>{children}</ThemeProvider>
        </body>
      </html>
    </SessionProvider>
  );
}
