import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "NGen Connect — Canada's AI Manufacturing Network",
  description: "Discover 1,000+ Canadian manufacturers, suppliers, and Industry 4.0 technology providers through AI-powered matchmaking.",
};

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,300..700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased bg-[#0A1628] text-white overflow-x-hidden">
        {children}
      </body>
    </html>
  );
}
