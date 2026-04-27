"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen, BookText, Columns2, FlaskConical, Lightbulb, MessageSquare, Search, FileText, Network } from "lucide-react";

import { supabaseBrowser } from "@/lib/supabase";

const NAV = [
  { href: "/library",    label: "Library",    Icon: BookOpen },
  { href: "/chat",       label: "Assistant",  Icon: MessageSquare },
  { href: "/search",     label: "Search",     Icon: Search },
  { href: "/notes",      label: "Notes",      Icon: FileText },
  { href: "/graph",      label: "Graph",      Icon: Network },
  { href: "/forge",      label: "Forge",      Icon: FlaskConical },
  { href: "/research",   label: "Research",   Icon: Lightbulb },
  { href: "/compare",    label: "Compare",    Icon: Columns2 },
  { href: "/lit-review", label: "Lit Review", Icon: BookText },
];

export default function Sidebar() {
  const router   = useRouter();
  const pathname = usePathname();
  const [email, setEmail]       = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [progress, setProgress] = useState<{ total: number; read: number; reading: number } | null>(null);

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

  useEffect(() => {
    import("@/lib/api").then(({ api }) =>
      api.listPapers().then(({ papers }) => {
        setProgress({
          total: papers.length,
          read: papers.filter((p: any) => p.status === "read").length,
          reading: papers.filter((p: any) => p.status === "reading").length,
        });
      }).catch(() => {})
    );
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
            <span className="font-bold text-[1.65rem] text-fg transition-opacity group-hover:opacity-80">α</span>
            <span className="font-bold text-[1.1rem] text-fg -ml-[1px] transition-opacity group-hover:opacity-80">x</span>
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

      {/* Reading progress */}
      {progress && progress.total > 0 && (
        <div className="mx-3 mb-2 rounded-lg border border-border bg-panel/50 px-3 py-2.5">
          <div className="mb-1.5 flex items-center justify-between text-[10px] font-medium uppercase tracking-widest text-muted">
            <span>Progress</span>
            <span className="font-mono">{progress.read}/{progress.total}</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent to-accent2 transition-all duration-500"
              style={{ width: `${Math.round((progress.read / progress.total) * 100)}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted">
            {progress.reading > 0 && (
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                {progress.reading} reading
              </span>
            )}
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {progress.read} read
            </span>
          </div>
        </div>
      )}

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
