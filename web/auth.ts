import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { SignJWT, jwtVerify } from "jose";

const API_INTERNAL_URL = process.env.API_INTERNAL_URL || "http://localhost:8000";
const AUTH_SECRET = process.env.AUTH_SECRET || "";

function secret() {
  return new TextEncoder().encode(AUTH_SECRET);
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Credentials({
      id: "credentials",
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        try {
          const res = await fetch(`${API_INTERNAL_URL}/auth/verify-credentials`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });
          if (!res.ok) return null;
          const user = await res.json();
          return {
            id: user.id,
            email: user.email,
            orgKey: user.orgKey,
            orgRole: user.orgRole,
          };
        } catch {
          return null;
        }
      },
    }),
  ],

  session: { strategy: "jwt" },

  jwt: {
    encode: async ({ token }) => {
      if (!token) return "";
      return new SignJWT(token as Record<string, unknown>)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("24h")
        .sign(secret());
    },
    decode: async ({ token }) => {
      if (!token) return null;
      try {
        const { payload } = await jwtVerify(token, secret());
        return payload as Record<string, unknown>;
      } catch {
        return null;
      }
    },
  },

  callbacks: {
    jwt({ token, user, trigger, session }) {
      // On sign-in, copy user fields into token
      if (user) {
        token.sub = user.id;
        token.email = user.email;
        token.orgKey = (user as { orgKey?: string }).orgKey;
        token.orgRole = (user as { orgRole?: string }).orgRole;
      }
      // On session update (org switch)
      if (trigger === "update" && session) {
        if (session.orgKey) token.orgKey = session.orgKey;
        if (session.orgRole) token.orgRole = session.orgRole;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub ?? "";
      session.user.email = (token.email as string) ?? session.user.email;
      (session as { orgKey?: string }).orgKey = token.orgKey as string | undefined;
      (session as { orgRole?: string }).orgRole = token.orgRole as string | undefined;
      return session;
    },
  },

  pages: {
    signIn: "/sign-in",
  },
});
