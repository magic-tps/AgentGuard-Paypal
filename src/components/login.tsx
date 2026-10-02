"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { Logo, ErrorState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { post } from "@/lib/client-api";
export function Login() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="login-page" id="main-content">
      <div className="login-story">
        <Logo light />
        <div>
          <span className="eyebrow">ACCOUNTABLE AUTONOMY</span>
          <h1>
            Intelligence can propose.
            <br />
            <span>You hold the authority.</span>
          </h1>
          <p>The trust layer between AI agents and your money.</p>
        </div>
        <div className="login-story-bottom">
          <ShieldCheck size={19} /> Every decision leaves a receipt.
        </div>
      </div>
      <div className="login-form-wrap">
        <form
          className="login-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await post("/api/session", { password });
              router.replace("/dashboard");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Sign-in failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="login-lock">
            <LockKeyhole size={24} />
          </div>
          <span className="eyebrow">OPERATOR ACCESS</span>
          <h2>Welcome to your workspace.</h2>
          <p>Sign in with your workspace operator password.</p>
          <label className="field">
            Operator password
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="Enter your workspace password"
            />
          </label>
          {error && <ErrorState message={error} />}
          <Button className="full-width" disabled={busy} type="submit">
            {busy ? "Signing in…" : "Sign in"}
            <ArrowRight size={16} />
          </Button>
          <p className="login-note">
            Local demo mode signs in automatically when you open the console on this machine.
          </p>
          <Button asChild variant="ghost" className="full-width">
            <a href="/dashboard">Open local demo console</a>
          </Button>
        </form>
      </div>
    </main>
  );
}
