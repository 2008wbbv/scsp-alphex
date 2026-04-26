"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, BookOpen, MessageSquare, Search, Network, BarChart3 } from "lucide-react";
import CornerFrameScrambleText from "@/components/ui/corner-frame-scramble-text";

import { supabaseBrowser } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

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

const FEATURES = [
  {
    icon: BookOpen,
    title: "Paper library",
    desc: "Import from arXiv, DOI, or upload PDFs. Everything in one place.",
  },
  {
    icon: Search,
    title: "Semantic search",
    desc: "Find relevant passages across your entire library using natural language.",
  },
  {
    icon: MessageSquare,
    title: "Grounded assistant",
    desc: "Ask questions and get answers cited directly from your papers.",
  },
  {
    icon: BarChart3,
    title: "Data visualizations",
    desc: "Auto-extract quantitative findings and generate charts from any paper.",
  },
  {
    icon: Network,
    title: "Similarity graph",
    desc: "See how your papers relate to each other through vector embeddings.",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState<"google" | "email" | null>(null);
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
      {/* Left panel — feature showcase */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 border-r border-border">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent2 text-xl font-bold text-ink">
            α
          </div>
          <span className="text-lg font-semibold text-white">Alphex</span>
        </div>

        <div className="space-y-8">
          <div>
            <CornerFrameScrambleText
              value="Research at the speed of thought."
              as="h1"
              className="text-4xl font-bold text-white leading-tight"
            />
            <p className="mt-6 text-muted text-base">
              Import papers, search semantically, and let an AI assistant grounded in your library answer your questions.
            </p>
          </div>

          <ul className="space-y-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-start gap-4">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent/15">
                  <f.icon size={16} className="text-accent2" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">{f.title}</div>
                  <div className="text-xs text-muted">{f.desc}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="text-xs text-muted">
          Hackathon demo. Data stored in Supabase.
        </div>
      </div>

      {/* Right panel — auth form */}
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="mb-8 flex flex-col items-center lg:hidden">
            <div className="grid h-12 w-12 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent2 text-2xl font-bold text-ink">
              α
            </div>
            <div className="mt-2 text-xl font-semibold text-white">Alphex</div>
          </div>

          <h2 className="text-xl font-semibold text-white">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {mode === "signin" ? "Sign in to your research workspace." : "Start building your paper library."}
          </p>

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

            <form onSubmit={submitEmail} className="space-y-3">
              <input
                type="email"
                className="input w-full"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                type="password"
                className="input w-full"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Button
                type="submit"
                variant="outline"
                className="w-full gap-3"
                disabled={loading !== null}
              >
                <Mail size={16} />
                {loading === "email"
                  ? "Please wait…"
                  : mode === "signup"
                  ? "Create account"
                  : "Sign in"}
              </Button>
            </form>

            {error && <div className="text-xs text-red-300">{error}</div>}

            <button
              type="button"
              onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}
              className="w-full text-center text-xs text-muted hover:text-white"
            >
              {mode === "signin" ? "No account? Create one" : "Already have an account? Sign in"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
