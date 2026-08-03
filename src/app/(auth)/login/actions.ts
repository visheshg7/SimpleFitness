"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

const attempts = new Map<string, { count: number; expires: number }>();

export async function login(password: string) {
  const now = Date.now();
  const record = attempts.get("single-login");
  if (record && record.expires > now && record.count >= 8) return { success: false as const, error: "Too many attempts. Try again shortly." };
  if (!process.env.APP_PASSWORD || password !== process.env.APP_PASSWORD) {
    attempts.set("single-login", { count: (record?.expires && record.expires > now ? record.count : 0) + 1, expires: now + 5 * 60_000 });
    return { success: false as const, error: "That passcode is not correct." };
  }
  const owner = (await getDb().select({ id: users.id }).from(users).limit(1))[0];
  if (!owner) return { success: false as const, error: "The journal is not initialized yet." };
  const token = await createSessionToken(owner.id);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
  redirect("/today");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
