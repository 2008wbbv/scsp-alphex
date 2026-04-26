"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabaseBrowser } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sb = supabaseBrowser();
    sb.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/library");
    });
  }, [router]);

  async function signInMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const sb = supabaseBrowser();
      const { error: err } = await sb.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (err) throw err;
      setSent(true);
    } catch (err: any) {
      setError(err.message ?? "Failed to send link");
    } finally {
      setLoading(false);
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
          <form onSubmit={signInMagicLink} className="mt-6 space-y-3">
            <input
              type="email"
              className="input w-full"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {error && <div className="text-xs text-red-300">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full"
            >
              {loading ? "Sending…" : "Send magic link"}
            </button>
          </form>
        )}

        <div className="mt-4 text-xs text-muted">
          By signing in you agree this is a hackathon demo and your data is
          stored in Supabase.
        </div>
      </div>
    </div>
  );
}
