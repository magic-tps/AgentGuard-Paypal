"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Bot,
  ChevronRight,
  CircleHelp,
  FileCheck2,
  FlaskConical,
  LayoutDashboard,
  ListFilter,
  LogOut,
  Menu,
  ShieldCheck,
  UserCheck,
  X,
} from "lucide-react";
import { Logo } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, useResource } from "@/lib/client-api";
import type { Session } from "@/lib/client-types";
import { AiModeBadge } from "@/components/ai-mode-badge";
const SessionContext = createContext<Session | null>(null);
export const useSession = () => useContext(SessionContext);
const navigation = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/mandates", label: "Spending mandates", icon: FileCheck2 },
  { href: "/agent", label: "Shopping agent", icon: Bot },
  { href: "/transactions", label: "Transactions", icon: ListFilter },
  { href: "/approvals", label: "Human approvals", icon: UserCheck },
  { href: "/attack-lab", label: "Attack Lab", icon: FlaskConical },
];
export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const { data: session, error } = useResource<Session>("/api/session");
  const selected = navigation.find((item) => path.startsWith(item.href));
  return (
    <SessionContext.Provider value={session}>
      <div className="app-shell">
        <button
          className={`sidebar-scrim ${open ? "visible" : ""}`}
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
        <aside className={`sidebar ${open ? "open" : ""}`}>
          <div className="sidebar-brand">
            <Logo light />
            <button
              className="mobile-close"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
            >
              <X size={20} />
            </button>
          </div>
          <div className="workspace-label">
            <span className="workspace-icon">AG</span>
            <div>
              <strong>Commerce workspace</strong>
              <span>Operator console</span>
            </div>
            <ChevronRight size={14} />
          </div>
          <p className="nav-caption">WORKSPACE</p>
          <nav aria-label="Main navigation">
            {navigation.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`nav-link ${path.startsWith(href) ? "selected" : ""}`}
                onClick={() => setOpen(false)}
              >
                <Icon size={18} />
                <span>{label}</span>
                {href === "/attack-lab" && <span className="nav-new">LAB</span>}
              </Link>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="boundary-note">
              <ShieldCheck size={21} />
              <strong>Intent is the boundary.</strong>
              <p>AI proposes. Deterministic controls authorize.</p>
            </div>
            <Link href="/" className="sidebar-about">
              <CircleHelp size={16} /> About AgentGuard <ArrowUpRight size={15} />
            </Link>
            <div className="operator">
              <span className="avatar">
                {session?.name
                  ?.split(" ")
                  .map((s) => s[0])
                  .join("")
                  .slice(0, 2) || "OP"}
              </span>
              <div>
                <strong>{session?.name || "Operator"}</strong>
                <span>{session?.localDemo ? "Local demo workspace" : "Workspace operator"}</span>
              </div>
              {session && !session.localDemo && (
                <button
                  aria-label="Log out"
                  onClick={async () => {
                    await api("/api/session", { method: "DELETE" });
                    router.replace("/login");
                  }}
                >
                  <LogOut size={16} />
                </button>
              )}
            </div>
          </div>
        </aside>
        <div className="app-main">
          <div className="topbar">
            <div className="breadcrumbs">
              <button
                className="mobile-menu"
                aria-label="Open navigation"
                onClick={() => setOpen(true)}
              >
                <Menu size={20} />
              </button>
              <span>Workspace</span>
              <ChevronRight size={13} />
              <strong>{selected?.label || "Console"}</strong>
            </div>
            <div className="topbar-status">
              <span className="live-dot" />
              <span className="small">Policy controls online</span>
              <AiModeBadge />
              <Badge tone={session?.mode === "PAYPAL_SANDBOX" ? "teal" : "neutral"}>
                <span aria-label="PAYMENT MODE">
                  {session?.mode === "PAYPAL_SANDBOX"
                    ? "PAYPAL SANDBOX"
                    : session
                      ? "SIMULATED"
                      : "CONNECTING"}
                </span>
              </Badge>
            </div>
          </div>
          {error && (
            <div className="session-alert" role="alert">
              {error}{" "}
              <Button asChild size="sm" variant="outline">
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
          )}
          <main className="page-content" id="main-content">
            {children}
          </main>
          <footer className="console-footer">
            <span>
              <ShieldCheck size={13} /> Every decision leaves a receipt.
            </span>
            <span>AgentGuard · Autonomous commerce, under control</span>
          </footer>
        </div>
      </div>
    </SessionContext.Provider>
  );
}
