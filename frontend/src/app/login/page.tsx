"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";

import { supabaseBrowser } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState<"google" | "email" | null>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sb = supabaseBrowser();
    sb.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/library");
    });
  }, [router]);

  async function signInGoogle() {
    setLoading("google");
    setError(null);
    try {
      const sb = supabaseBrowser();
      await sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
    } catch (err: any) {
      setError(err.message ?? "Failed to sign in with Google");
      setLoading(null);
    }
  }

  async function signInEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading("email");
    setError(null);
    try {
      const sb = supabaseBrowser();
      const { error: err } = await sb.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (err) throw err;
      setSent(true);
    } catch (err: any) {
      setError(err.message ?? "Failed to send link");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink p-6">
      <div className="card w-full max-w-md text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent2 text-2xl font-bold text-ink">
          α
        </div>
        <h1 className="text-2xl font-semibold text-white">Alphex</h1>
        <p className="mt-1 text-sm text-muted">
          Your AI research workspace. Upload papers, search semantically, chat
          with a grounded assistant.
        </p>

        {sent ? (
          <div className="mt-6 rounded-md border border-border bg-panel2 p-4 text-sm text-white">
            Check your email — a sign-in link was sent to <strong>{email}</strong>.
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            <Button
              type="button"
              variant="outline"
              className="w-full gap-3"
              disabled={loading !== null}
              onClick={signInGoogle}
            >
              <GoogleIcon />
              {loading === "google" ? "Redirecting…" : "Continue with Google"}
            </Button>

            <div className="flex items-center gap-3 text-xs text-muted">
              <div className="h-px flex-1 bg-border" />
              or
              <div className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={signInEmail} className="space-y-3">
              <input
                type="email"
                className="input w-full"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Button
                type="submit"
                variant="outline"
                className="w-full gap-3"
                disabled={loading !== null}
              >
                <Mail size={16} />
                {loading === "email" ? "Sending…" : "Continue with Email"}
              </Button>
            </form>

            {error && <div className="text-xs text-red-300">{error}</div>}
          </div>
        )}

        <div className="mt-4 text-xs text-muted">
          By signing in you agree this is a hackathon demo and your data is
          stored in Supabase.
        </div>
      </div>
    </div>
  );
}
