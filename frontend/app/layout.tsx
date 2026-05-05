import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "RepoMind AI",
  description: "Ask questions about your codebase.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

