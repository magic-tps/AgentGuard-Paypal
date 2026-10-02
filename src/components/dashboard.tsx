"use client";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CheckCheck,
  Fingerprint,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Wallet,
} from "lucide-react";
import { Architecture, EmptyState, ErrorState, Loading, PageHeader } from "@/components/shared";
import { TransactionGrid } from "@/components/transaction-grid";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useResource } from "@/lib/client-api";
import type { Overview, Transaction } from "@/lib/client-types";
import { money } from "@/lib/utils";
export function Dashboard() {
  const { data, error, loading, refresh } = useResource<Overview>("/api/overview");
  return (
    <>
      <PageHeader
        eyebrow="YOUR AUTONOMOUS COMMERCE, UNDER CONTROL"
        title="Operations overview"
        description="Every purchase has a purpose. Every decision has a boundary."
        action={
          <>
            <Button
              variant="outline"
              size="icon"
              aria-label="Refresh dashboard"
              onClick={refresh}
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? "spin" : ""} />
            </Button>
            <Button asChild>
              <Link href="/mandates/new">
                <Plus size={16} /> Create mandate
              </Link>
            </Button>
          </>
        }
      />
      {error ? (
        <ErrorState message={error} retry={refresh} />
      ) : loading && !data ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="metrics">
              {[
                {
                  label: "Autonomous spend",
                  value: money(data.stats.autonomousSpend),
                  icon: Wallet,
                  note: "Captured transactions",
                },
                {
                  label: "Blocked attempts",
                  value: data.stats.blockedAttempts,
                  icon: ShieldAlert,
                  note: "Stopped by policy",
                  tone: "red",
                },
                {
                  label: "Human approvals",
                  value: data.stats.humanApprovals,
                  icon: UserCheck,
                  note: "Awaiting your decision",
                  tone: "amber",
                },
                {
                  label: "Protected agents",
                  value: data.stats.protectedAgents,
                  icon: Bot,
                  note: "Bound to your policies",
                },
                {
                  label: "Policy violations",
                  value: data.stats.policyViolations,
                  icon: Fingerprint,
                  note: "Recorded check failures",
                },
              ].map(({ label, value, icon: Icon, note, tone }) => (
                <article className={`metric ${tone || ""}`} key={label}>
                  <div>
                    <span>{label}</span>
                    <Icon size={17} />
                  </div>
                  <strong>{value}</strong>
                  <p>{note}</p>
                </article>
              ))}
            </div>
            <div className="data-scope">
              <Badge>INCLUDES SIMULATED DATA</Badge>
              <span>{data.scope}</span>
            </div>
            <section className="control-banner">
              <div className="control-banner-title">
                <span className="control-shield">
                  <ShieldCheck size={26} />
                </span>
                <div>
                  <h2>Your intent is enforced at every step.</h2>
                  <p>AI interprets intent. Deterministic controls authorize money movement.</p>
                </div>
              </div>
              <Button asChild variant="secondary" size="sm">
                <Link href="/attack-lab">
                  Test the boundary <ArrowRight size={15} />
                </Link>
              </Button>
            </section>
            <div className="section-heading">
              <div>
                <h2>Recent transactions</h2>
                <p>Policy decisions and payment outcomes, in one place.</p>
              </div>
              <Link href="/transactions" className="text-link">
                View all transactions <ArrowRight size={15} />
              </Link>
            </div>
            {data.transactions.length ? (
              <TransactionGrid transactions={data.transactions} compact />
            ) : (
              <EmptyState
                title="Ready for the first proposal"
                description="Choose a mandate and ask the shopping agent to find a product."
                action={
                  <Button asChild>
                    <Link href="/agent">Open shopping agent</Link>
                  </Button>
                }
              />
            )}
            <div className="dashboard-bottom">
              <section className="panel architecture-panel">
                <div className="panel-heading">
                  <h3>The authorization boundary</h3>
                  <CheckCheck size={18} />
                </div>
                <Architecture compact />
                <p className="small muted">
                  The AI can recommend. The policy engine authorizes. PayPal executes.
                </p>
              </section>
              <Link href="/attack-lab" className="lab-invite">
                <div className="eyebrow">ADVERSARIAL TESTING</div>
                <h3>
                  Can an agent cross
                  <br />
                  your spending boundary?
                </h3>
                <span>
                  Find out in the Attack Lab <ArrowRight size={17} />
                </span>
                <span className="lab-invite-symbol" aria-hidden>
                  ↗
                </span>
              </Link>
            </div>
          </>
        )
      )}
    </>
  );
}
export function TransactionsPage() {
  const { data, error, loading, refresh } = useResource<Transaction[]>("/api/transactions");
  return (
    <>
      <PageHeader
        eyebrow="TRANSACTION LEDGER"
        title="Every decision. On record."
        description="Inspect proposals, policy evidence, approvals, and payment operations."
        action={
          <Button variant="outline" onClick={refresh} disabled={loading}>
            <RefreshCw size={15} /> Refresh
          </Button>
        }
      />
      <div className="section-intro">
        <ShieldCheck size={18} />
        <p>Simulation is explicitly identified on each transaction and receipt.</p>
      </div>
      {error ? (
        <ErrorState message={error} retry={refresh} />
      ) : loading && !data ? (
        <Loading />
      ) : data?.length ? (
        <TransactionGrid transactions={data} />
      ) : (
        <EmptyState
          title="No transactions yet"
          description="Start with the shopping agent or run an Attack Lab scenario."
          action={
            <Button asChild>
              <Link href="/agent">Propose a purchase</Link>
            </Button>
          }
        />
      )}
    </>
  );
}
