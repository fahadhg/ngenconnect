import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "NGen Connect — Manufacturing Matchmaker",
  description: "Discover Canadian manufacturers, suppliers, and technology providers across the Industry 4.0 ecosystem.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-gray-50">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,300..700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <meta name="theme-color" content="#0A1628" />
      </head>
      <body className="text-gray-900 antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
