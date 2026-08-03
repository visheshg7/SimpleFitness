import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "training_journal_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 14;

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 24) throw new Error("SESSION_SECRET must be at least 24 characters.");
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(ownerId: string) {
  return new SignJWT({ ownerId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return typeof payload.ownerId === "string" ? payload.ownerId : null;
  } catch {
    return null;
  }
}

export async function currentOwnerId() {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function requireSession() {
  const ownerId = await currentOwnerId();
  if (!ownerId) throw new Error("UNAUTHENTICATED");
  return ownerId;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_MAX_AGE,
};
