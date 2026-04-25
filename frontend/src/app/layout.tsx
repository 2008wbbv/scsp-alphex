import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alphex — research, accelerated",
  description:
    "Upload papers, search them semantically, and chat with a research assistant grounded in your library.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-ink text-white antialiased">{children}</body>
    </html>
  );
}
