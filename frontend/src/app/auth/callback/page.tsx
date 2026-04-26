"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { supabaseBrowser } from "@/lib/supabase";

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const sb = supabaseBrowser();
    const code = new URLSearchParams(window.location.search).get("code");
    const exchange = code
      ? sb.auth.exchangeCodeForSession(code)
      : Promise.resolve(null);
    exchange
      .then(() => sb.auth.getSession())
      .then(({ data }) => {
        router.replace(data.session ? "/library" : "/login");
      })
      .catch(() => {
        router.replace("/login");
      });
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center text-muted">
      Signing you in…
    </div>
  );
}
