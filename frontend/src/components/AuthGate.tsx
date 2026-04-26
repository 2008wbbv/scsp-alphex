"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sb = supabaseBrowser();
    sb.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
      } else {
        setReady(true);
      }
    }).catch(() => {
      router.replace("/login");
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      if (!session) {
        router.replace("/login");
      } else {
        setReady(true);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  if (!ready) {
    return (
      <div className="flex h-screen w-full items-center justify-center text-muted">
        Loading…
      </div>
    );
  }
  return <>{children}</>;
}
