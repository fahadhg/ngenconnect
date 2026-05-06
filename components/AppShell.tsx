"use client";

import { usePathname } from "next/navigation";
import NavSidebar from "./NavSidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === "/login" || pathname.startsWith("/auth");

  if (isAuthPage) return <>{children}</>;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <NavSidebar />
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {children}
      </div>
    </div>
  );
}
