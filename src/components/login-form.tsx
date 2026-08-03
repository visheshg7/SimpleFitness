"use client";

import { useState, useTransition } from "react";
import { login } from "@/app/(auth)/login/actions";

export function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return <form className="auth-form" onSubmit={(event) => { event.preventDefault(); setError(""); startTransition(async () => { const result = await login(password); if (!result?.success) setError(result?.error ?? "Unable to sign in."); }); }}><label className="form-label" htmlFor="password">Passcode</label><input className="field" id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />{error && <p className="error-text" aria-live="polite">{error}</p>}<button className="button" type="submit" disabled={pending}>{pending ? "Checking..." : "Open journal"}</button></form>;
}
