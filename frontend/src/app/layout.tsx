import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "P2P — Peer-to-peer lending, powered by Stellar.",
  description:
    "P2P is a peer-to-peer lending application built on Stellar and Soroban.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
