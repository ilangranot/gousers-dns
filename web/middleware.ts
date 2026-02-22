import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublic = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)"]);
const isSuperAdmin = createRouteMatcher(["/superadmin(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (process.env.NODE_ENV === "development" && req.headers.get("x-bypass-auth") === "1") {
    return; // dev bypass for testing
  }
  if (!isPublic(req)) {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.redirect(new URL("/sign-in", req.url));
    }
  }
  // For superadmin routes: the layout component does the email-based staff check.
  // Middleware only ensures the user is authenticated (handled above).
  void isSuperAdmin;
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
