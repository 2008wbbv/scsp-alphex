"use client";

import AuthGate from "./AuthGate";
import Sidebar from "./Sidebar";

export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="flex h-screen w-full overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto scroll">{children}</main>
      </div>
    </AuthGate>
  );
}
