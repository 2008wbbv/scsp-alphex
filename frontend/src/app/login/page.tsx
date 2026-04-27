"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, ArrowRight } from "lucide-react";

import { supabaseBrowser } from "@/lib/supabase";

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

const CAPABILITIES = [
  "Semantic search across every passage",
  "Grounded assistant with inline citations",
  "Auto-extract charts from quantitative findings",
  "Similarity graph across your entire library",
  "One-click LaTeX export with bibliography",
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState<"google" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabaseBrowser()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) router.replace("/library");
      });
  }, [router]);

  async function signInGoogle() {
    setLoading("google");
    setError(null);
    try {
      await supabaseBrowser().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
    } catch (err: any) {
      setError(err.message ?? "Failed to sign in with Google");
      setLoading(null);
    }
  }

  async function signInDemo() {
    setLoading("email");
    setError(null);
    setEmail("demo@alphex.ai");
    setPassword("demo1234");
    try {
      const { error: err } = await supabaseBrowser().auth.signInWithPassword({
        email: "demo@alphex.ai",
        password: "demo1234",
      });
      if (err) throw err;
      router.replace("/library");
    } catch {
      setError("Demo account unavailable — please sign up for free.");
    } finally {
      setLoading(null);
    }
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading("email");
    setError(null);
    try {
      const sb = supabaseBrowser();
      if (mode === "signup") {
        const { error: err } = await sb.auth.signUp({ email: email.trim(), password });
        if (err) throw err;
      } else {
        const { error: err } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
      }
      router.replace("/library");
    } catch (err: any) {
      setError(err.message ?? "Authentication failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex min-h-screen bg-ink">
      {/* ── Left panel: hero ─────────────────────────────────── */}
      <div className="hero-grid relative hidden overflow-hidden lg:flex lg:w-[55%] flex-col justify-between p-14 border-r border-border">
        {/* Radial glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-32 -top-32 h-[600px] w-[600px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(124,92,255,0.12) 0%, transparent 70%)",
          }}
        />

        {/* Logo */}
        <div className="relative flex items-center gap-2.5 select-none">
          <div className="flex items-baseline leading-none">
            <span className="font-bold text-[1.9rem] text-fg">α</span>
            <span className="font-bold text-[1.3rem] text-fg -ml-[1px]">x</span>
          </div>
          <span className="text-base font-semibold text-fg">Alphex</span>
        </div>

        {/* Hero headline */}
        <div className="relative space-y-6">
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted">
              AI research platform
            </p>
            {/* The editorial pairing: Geist structure + Instrument Serif italic accent */}
            <h1 className="text-[4.5rem] font-semibold leading-[1.05] tracking-tight text-fg">
              research,
              <br />
              accelerated.
            </h1>
            <p className="mt-6 max-w-sm text-base leading-relaxed text-muted">
              Import any paper. Ask anything. Publish faster.
            </p>
          </div>

          {/* Capability list */}
          <ul className="space-y-2.5">
            {CAPABILITIES.map((c) => (
              <li key={c} className="flex items-start gap-3 text-sm text-muted">
                <ArrowRight
                  size={14}
                  className="mt-0.5 shrink-0 text-accent/60"
                />
                {c}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-muted/50">
          Powered by Claude + OpenAI embeddings + pgvector
        </p>
      </div>

      {/* ── Right panel: auth form ───────────────────────────── */}
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-[340px]">
          {/* Mobile logo */}
          <div className="mb-8 flex flex-col items-center lg:hidden select-none">
            <div className="flex items-baseline leading-none">
              <span className="font-bold text-[3.5rem] text-fg">α</span>
              <span className="font-bold text-[2.4rem] text-fg -ml-[2px]">x</span>
            </div>
            <p className="mt-2 text-sm text-muted">
              research, accelerated.
            </p>
          </div>

          {/* Heading */}
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-fg">
              {mode === "signin" ? "Welcome back" : "Create account"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {mode === "signin"
                ? "Sign in to your research workspace."
                : "Start building your paper library."}
            </p>
          </div>

          <div className="space-y-3">
            {/* Google */}
            <button
              type="button"
              disabled={loading !== null}
              onClick={signInGoogle}
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-panel px-4 py-2.5 text-sm font-medium text-fg transition-all hover:bg-panel2 disabled:opacity-50"
            >
              <GoogleIcon />
              {loading === "google" ? "Redirecting…" : "Continue with Google"}
            </button>

            <div className="flex items-center gap-3 text-xs text-muted">
              <div className="h-px flex-1 bg-border" />
              or continue with email
              <div className="h-px flex-1 bg-border" />
            </div>

            {/* Email/password */}
            <form onSubmit={submitEmail} className="space-y-2.5">
              <input
                type="email"
                className="input"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                type="password"
                className="input"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="submit"
                disabled={loading !== null}
                className="btn btn-primary w-full py-2.5"
              >
                <Mail size={15} />
                {loading === "email"
                  ? "Please wait…"
                  : mode === "signup"
                  ? "Create account"
                  : "Sign in"}
              </button>
            </form>

            {error && (
              <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
              }}
              className="w-full text-center text-xs text-muted transition-colors hover:text-fg"
            >
              {mode === "signin"
                ? "No account? Create one →"
                : "Already have an account? Sign in →"}
            </button>

            <div className="flex items-center gap-3 text-xs text-muted">
              <div className="h-px flex-1 bg-border" />
              or
              <div className="h-px flex-1 bg-border" />
            </div>

            <button
              type="button"
              disabled={loading !== null}
              onClick={signInDemo}
              className="w-full text-center text-xs text-accent2/70 transition-colors hover:text-accent2 disabled:opacity-50"
            >
              Try demo account →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
