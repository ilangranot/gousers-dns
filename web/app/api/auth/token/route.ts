import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { SignJWT } from "jose";

const AUTH_SECRET = process.env.AUTH_SECRET || "";

function secret() {
  return new TextEncoder().encode(AUTH_SECRET);
}

/**
 * GET /api/auth/token
 * Returns a signed HS256 Bearer token for the current session.
 * The frontend uses this to authenticate against the FastAPI backend.
 */
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload: Record<string, unknown> = {
    sub: session.user.id,
    email: session.user.email,
    orgKey: (session as { orgKey?: string }).orgKey,
    orgRole: (session as { orgRole?: string }).orgRole,
  };

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret());

  return NextResponse.json({ token });
}
