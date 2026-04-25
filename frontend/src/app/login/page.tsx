"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabaseBrowser } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const sb = supabaseBrowser();
    sb.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/library");
    });
  }, [router]);

  async function signInGoogle() {
    setLoading(true);
    const sb = supabaseBrowser();
    await sb.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
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
        <button
          onClick={signInGoogle}
          disabled={loading}
          className="btn btn-primary mt-6 w-full"
        >
          {loading ? "Redirecting…" : "Continue with Google"}
        </button>
        <div className="mt-4 text-xs text-muted">
          By signing in you agree this is a hackathon demo and your data is
          stored in Supabase.
        </div>
      </div>
    </div>
  );
}
