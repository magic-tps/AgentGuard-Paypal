"use client";
import Link from "next/link";
import { ArrowUpRight, RefreshCw, UserCheck } from "lucide-react";
import { EmptyState, ErrorState, Loading, PageHeader, StatusBadge } from "@/components/shared";
import { PaymentActions } from "@/components/payment-actions";
import { Button } from "@/components/ui/button";
import { useResource } from "@/lib/client-api";
import type { Transaction } from "@/lib/client-types";
import { money } from "@/lib/utils";
export function Approvals() {
  const { data, setData, error, loading, refresh } = useResource<Transaction[]>("/api/approvals");
  return (
    <>
      <PageHeader
        eyebrow="HUMAN IN THE LOOP"
        title="The final say is yours."
        description="Review the exact amount, items, and policy before granting authority."
        action={
          <Button variant="outline" disabled={loading} onClick={refresh}>
            <RefreshCw size={15} /> Refresh queue
          </Button>
        }
      />
      <div className="section-intro">
        <UserCheck size={18} />
        <p>
          Each approval is bound to a specific quote and policy version. Changes trigger a fresh
          evaluation.
        </p>
      </div>
      {error ? (
        <ErrorState message={error} retry={refresh} />
      ) : loading && !data ? (
        <Loading />
      ) : !data?.length ? (
        <EmptyState
          title="You’re all caught up"
          description="Transactions that need your decision will appear here. Your agent’s authority remains bounded."
          action={
            <Button asChild variant="outline">
              <Link href="/attack-lab">Test an approval scenario</Link>
            </Button>
          }
        />
      ) : (
        <div className="approval-list">
          {data.map((t) => (
            <article className="approval-card" key={t.id}>
              <div className="approval-info">
                <div className="inline spread">
                  <span className="mono small">TX-{t.id.slice(0, 8).toUpperCase()}</span>
                  <StatusBadge value={t.status} mode={t.mode} />
                </div>
                <h2>{t.agent.name} requests your review</h2>
                <p className="muted small">
                  {t.merchant.name} · {t.mandate.name} · policy v{t.policyVersion.version}
                </p>
                <div className="approval-items">
                  {t.currentQuote.items.map((i, n) => (
                    <div key={`${i.productId}-${n}`}>
                      <span>
                        {i.quantity} × {i.name}
                      </span>
                      <strong>{money((i.quantity * i.unitPriceCents) / 100)}</strong>
                    </div>
                  ))}
                </div>
                <div className="receipt-total">
                  <span>Current total</span>
                  <strong>{money(t.amount, t.currency)}</strong>
                </div>
                {t.quote.amount !== t.currentQuote.amount && (
                  <p className="price-change">
                    Previous quote {money(t.quote.amount)} → current {money(t.currentQuote.amount)}
                  </p>
                )}
                <p className="approval-reason">
                  {t.evaluation.checks
                    .filter((c) => !c.passed)
                    .map((c) => c.explanation)
                    .join(" ") || "An explicit human decision is required for this quote."}
                </p>
                <Link className="text-link" href={`/transactions/${t.id}`}>
                  Inspect complete receipt <ArrowUpRight size={15} />
                </Link>
              </div>
              <PaymentActions
                transaction={t}
                onUpdate={(updated) =>
                  setData((data || []).map((item) => (item.id === updated.id ? updated : item)))
                }
              />
            </article>
          ))}
        </div>
      )}
    </>
  );
}
