"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen, MessageSquare, Search, FileText, Network } from "lucide-react";

import { supabaseBrowser } from "@/lib/supabase";

const NAV = [
  { href: "/library",  label: "Library",   Icon: BookOpen },
  { href: "/chat",     label: "Assistant",  Icon: MessageSquare },
  { href: "/search",   label: "Search",     Icon: Search },
  { href: "/notes",    label: "Notes",      Icon: FileText },
  { href: "/graph",    label: "Graph",      Icon: Network },
];

export default function Sidebar() {
  const router   = useRouter();
  const pathname = usePathname();
  const [email, setEmail]       = useState<string | null>(null);
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
    try { await supabaseBrowser().auth.signOut(); } catch { /* ignore */ }
    finally { router.replace("/login"); }
  }

  const initials = email ? email[0].toUpperCase() : "?";

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-border bg-panel/70 backdrop-blur-sm">
      {/* Logo */}
      <div className="px-4 py-5">
        <Link href="/library" className="group flex items-center gap-3">
          {/* αx logotype */}
          <div className="flex items-baseline leading-none select-none">
            <span className="font-serif italic text-[1.65rem] text-fg transition-opacity group-hover:opacity-80">α</span>
            <span className="font-sans font-bold text-[1.1rem] text-fg -ml-[1px] transition-opacity group-hover:opacity-80">x</span>
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-fg">Alphex</div>
            <div className="text-[10px] tracking-wide text-muted">research, accelerated</div>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        {NAV.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-all ${
                active
                  ? "bg-accent/10 text-fg"
                  : "text-muted hover:bg-panel2 hover:text-fg"
              }`}
            >
              {active && (
                <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-accent" />
              )}
              <item.Icon
                size={15}
                className={`shrink-0 transition-colors ${
                  active ? "text-fg" : "text-muted group-hover:text-fg"
                }`}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom: user */}
      <div className="border-t border-border px-4 py-4 space-y-3">
        {authReady && (
          email ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-panel2 border border-border text-[10px] font-bold text-fg">
                  {initials}
                </div>
                <div className="min-w-0 truncate text-xs text-muted" title={email}>
                  {email}
                </div>
              </div>
              <button onClick={signOut} className="btn w-full py-1.5 text-xs">
                Sign out
              </button>
            </div>
          ) : (
            <Link href="/login" className="btn btn-primary w-full text-xs">
              Sign in
            </Link>
          )
        )}
      </div>
    </aside>
  );
}
