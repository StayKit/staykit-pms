import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StayKit — Homestay Reservation Management",
  description:
    "Open-source, self-hostable booking & reservation management for Indian homestay owners — with an MCP server for Claude.ai.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;550;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
