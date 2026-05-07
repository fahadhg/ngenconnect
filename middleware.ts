import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Test auth mode - skip Supabase authentication entirely
  // This allows full access to the app for UI testing
  // Remove this and restore Supabase auth for production
  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api|auth).*)",
  ],
};
