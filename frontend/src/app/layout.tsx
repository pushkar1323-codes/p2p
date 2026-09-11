import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ThemeInitScript } from "@/components/theme/ThemeInitScript";

export const metadata: Metadata = {
  title: "P2P — Peer-to-peer lending, powered by Stellar.",
  description:
    "P2P is a peer-to-peer lending application built on Stellar and Soroban.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeInitScript />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
