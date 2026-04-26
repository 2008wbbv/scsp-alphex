"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen, MessageSquare, Search, FileText, Network } from "lucide-react";

import { supabaseBrowser } from "@/lib/supabase";

const NAV = [
  { href: "/library", label: "Library", Icon: BookOpen },
  { href: "/chat", label: "Assistant", Icon: MessageSquare },
  { href: "/search", label: "Search", Icon: Search },
  { href: "/notes", label: "Notes", Icon: FileText },
  { href: "/graph", label: "Graph", Icon: Network },
];

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const sb = supabaseBrowser();
    sb.auth.getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null))
      .catch(() => setEmail(null))
      .finally(() => setAuthReady(true));
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

  const initials = email ? email[0].toUpperCase() : "?";

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-border bg-panel/60 p-4">
      <Link href="/library" className="mb-6 flex items-center gap-2.5 group">
        <div className="relative grid h-8 w-8 place-items-center rounded-lg bg-accent font-bold text-white text-sm">
          α
        </div>
        <div className="leading-tight">
          <div className="font-semibold text-[#0b0b0e]">Alphex</div>
          <div className="text-[10px] text-muted tracking-wide">research, accelerated</div>
        </div>
      </Link>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5">
        {NAV.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-all ${
                active
                  ? "bg-accent/10 text-accent font-medium"
                  : "text-muted hover:bg-panel2 hover:text-[#0b0b0e]"
              }`}
            >
              {active && (
                <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-accent" />
              )}
              <item.Icon
                size={15}
                className={`shrink-0 transition-colors ${active ? "text-accent" : "text-muted group-hover:text-[#0b0b0e]"}`}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="mt-auto border-t border-border pt-4">
        {!authReady ? null : email ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] font-bold text-accent">
                {initials}
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs text-muted" title={email}>
                  {email}
                </div>
              </div>
            </div>
            <button onClick={signOut} className="btn w-full text-xs py-1.5">
              Sign out
            </button>
          </div>
        ) : (
          <Link href="/login" className="btn btn-primary w-full">
            Sign in
          </Link>
        )}
      </div>
    </aside>
  );
}
