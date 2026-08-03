import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return <main className="auth-page"><section className="auth-card"><div className="auth-mark">Training journal</div><h1 className="auth-title">A clearer<br />way to train.</h1><p className="auth-copy">A private place to keep the work visible. Enter your passcode to continue.</p><LoginForm /></section></main>;
}
