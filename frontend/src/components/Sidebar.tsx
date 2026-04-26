"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase";

const NAV = [
  { href: "/library", label: "Library", icon: "📚" },
  { href: "/chat", label: "Assistant", icon: "🤖" },
  { href: "/search", label: "Search", icon: "🔎" },
  { href: "/notes", label: "Notes", icon: "📝" },
  { href: "/graph", label: "Graph", icon: "🕸️" },
];

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const sb = supabaseBrowser();
    sb.auth.getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null))
      .catch(() => setEmail(null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signOut() {
    try {
      await supabaseBrowser().auth.signOut();
    } catch {
      // ignore sign-out errors
    } finally {
      router.replace("/login");
    }
  }

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-border bg-panel/60 p-4">
      <Link href="/library" className="mb-6 flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-md bg-gradient-to-br from-accent to-accent2 font-bold text-ink">
          α
        </div>
        <div className="leading-tight">
          <div className="font-semibold text-white">Alphex</div>
          <div className="text-[11px] text-muted">research, accelerated</div>
        </div>
      </Link>

      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition ${
                active
                  ? "bg-accent/15 text-white"
                  : "text-muted hover:bg-panel2 hover:text-white"
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-border pt-4">
        {email ? (
          <>
            <div className="truncate text-xs text-muted" title={email}>
              {email}
            </div>
            <button onClick={signOut} className="btn mt-2 w-full">
              Sign out
            </button>
          </>
        ) : (
          <Link href="/login" className="btn btn-primary w-full">
            Sign in
          </Link>
        )}
      </div>
    </aside>
  );
}
