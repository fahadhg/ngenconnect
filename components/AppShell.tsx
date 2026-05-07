"use client";

import { usePathname } from "next/navigation";
import NavSidebar from "./NavSidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === "/login" || pathname.startsWith("/auth");

  if (isAuthPage) return <>{children}</>;

  const isScrollable = pathname.startsWith("/trade") || pathname.startsWith("/map");

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <NavSidebar />
      <div className={`flex-1 min-w-0 flex flex-col ${isScrollable ? "overflow-y-auto" : "overflow-hidden"}`}>
        {children}
      </div>
    </div>
  );
}
