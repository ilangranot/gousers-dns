import { auth } from "@/auth";
import { NextResponse } from "next/server";

const PUBLIC_PATHS = ["/", "/sign-in", "/sign-up", "/forgot-password", "/reset-password"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (!req.auth && !isPublic) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }
});

export const config = {
  matcher: ["/((?!_next|.*\\..*|api/auth).*)"],
};
