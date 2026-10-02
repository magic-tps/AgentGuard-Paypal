"use client";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Download,
  FileCheck2,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { AuditTimeline, ErrorState, Loading, PageHeader, StatusBadge } from "@/components/shared";
import { PaymentActions } from "@/components/payment-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useResource } from "@/lib/client-api";
import type { Transaction } from "@/lib/client-types";
import { date, humanize, money } from "@/lib/utils";
export function Receipt({ id }: { id: string }) {
  const {
    data: t,
    setData,
    error,
    loading,
    refresh,
  } = useResource<Transaction>(`/api/transactions/${id}`);
  if (error) return <ErrorState message={error} retry={refresh} />;
  if (loading && !t) return <Loading label="Retrieving decision evidence…" />;
  if (!t) return null;
  function download() {
    if (!t) return;
    const blob = new Blob([JSON.stringify(t, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agentguard-receipt-${t.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <Link href="/transactions" className="back-link">
        <ArrowLeft size={14} /> All transactions
      </Link>
      <PageHeader
        eyebrow="VERIFIABLE DECISION RECORD"
        title="Decision receipt"
        description={`TX-${t.id.slice(0, 8).toUpperCase()} · ${date(t.createdAt)}`}
        action={
          <>
            <Button
              variant="outline"
              size="icon"
              onClick={refresh}
              aria-label="Refresh receipt"
              disabled={loading}
            >
              <RefreshCw size={15} className={loading ? "spin" : ""} />
            </Button>
            <Button variant="outline" onClick={download}>
              <Download size={15} /> Export JSON
            </Button>
          </>
        }
      />
      <div className={`receipt-verdict verdict-${t.decision.toLowerCase()}`}>
        <div className="receipt-verdict-icon">
          <ShieldCheck size={29} />
        </div>
        <div>
          <span className="eyebrow">DETERMINISTIC POLICY DECISION</span>
          <h2>
            {t.decision === "ALLOW"
              ? "Within your mandate."
              : t.decision === "BLOCK"
                ? "Stopped at the boundary."
                : "Your approval is required."}
          </h2>
          <p>
            {t.decision === "ALLOW"
              ? "All hard policy constraints passed. Payment operations remain server-controlled."
              : t.decision === "BLOCK"
                ? "The proposed purchase does not comply with the human’s spending mandate."
                : "The transaction needs an explicit human decision before payment can proceed."}
          </p>
        </div>
        <div className="verdict-badges">
          <StatusBadge value={t.decision} />
          <StatusBadge value={t.status} mode={t.mode} />
        </div>
      </div>
      <div className="detail-layout receipt-layout">
        <div className="stack">
          <section className="panel">
            <div className="panel-heading">
              <h2>Purchase proposal</h2>
              <Badge>{t.mode === "SIMULATED" ? "SIMULATED" : "PAYPAL SANDBOX"}</Badge>
            </div>
            <div className="receipt-context">
              <div>
                <span>AGENT</span>
                <strong>{t.agent.name}</strong>
              </div>
              <div>
                <span>MERCHANT</span>
                <strong>{t.merchant.name}</strong>
              </div>
              <div>
                <span>POLICY VERSION</span>
                <Link href={`/mandates/${t.mandate.id}`}>
                  v{t.policyVersion.version} <ArrowUpRight size={13} />
                </Link>
              </div>
            </div>
            <p className="proposal-explanation">{t.purchaseRequest.explanation}</p>
            <div className="receipt-items">
              {t.currentQuote.items.map((item, index) => (
                <div key={`${item.productId}-${index}`}>
                  <span className="item-quantity">{item.quantity}×</span>
                  <div>
                    <strong>{item.name}</strong>
                    <p>
                      {item.condition} · {item.category}
                      {item.specifications.sizeInches
                        ? ` · ${item.specifications.sizeInches}″`
                        : ""}
                    </p>
                  </div>
                  <strong>{money((item.unitPriceCents * item.quantity) / 100, t.currency)}</strong>
                </div>
              ))}
            </div>
            {t.quote.amount !== t.currentQuote.amount && (
              <div className="price-change">
                <Badge tone="amber">PRICE CHANGED</Badge>
                <span>
                  {money(t.quote.amount)} → <strong>{money(t.currentQuote.amount)}</strong>
                </span>
              </div>
            )}
            <div className="receipt-total">
              <span>Current transaction total</span>
              <strong>{money(t.amount, t.currency)}</strong>
            </div>
            <div className="receipt-budget">
              <div>
                <span>Autonomous limit</span>
                <strong>{money(t.policy.autonomousLimit)}</strong>
              </div>
              <div>
                <span>Hard maximum</span>
                <strong>{money(t.policy.maxTotal)}</strong>
              </div>
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Deterministic policy checks</h2>
              <Badge>
                {t.evaluation.checks.filter((c) => c.passed).length}/{t.evaluation.checks.length}{" "}
                passed
              </Badge>
            </div>
            <div className="checks-table">
              {t.evaluation.checks.map((check, index) => (
                <details
                  className={`policy-check ${check.passed ? "passed" : "failed"}`}
                  key={`${check.code}-${index}`}
                >
                  <summary>
                    <span className="check-icon">
                      {check.passed ? <Check size={13} /> : <X size={13} />}
                    </span>
                    <strong>{humanize(check.code)}</strong>
                    <span>{check.passed ? "PASS" : "FAIL"}</span>
                  </summary>
                  <div className="check-evidence">
                    <p>{check.explanation}</p>
                    <dl>
                      <div>
                        <dt>Expected</dt>
                        <dd>{check.expected}</dd>
                      </div>
                      <div>
                        <dt>Actual</dt>
                        <dd>{check.actual}</dd>
                      </div>
                    </dl>
                  </div>
                </details>
              ))}
            </div>
            {t.evaluation.violations.length > 0 && (
              <div className="violation-list">
                <span className="eyebrow">RECORDED VIOLATIONS</span>
                <div className="chip-row">
                  {t.evaluation.violations.map((v) => (
                    <Badge tone="red" key={v}>
                      {v}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Transaction audit timeline</h2>
              <Badge>{t.audits.length} events</Badge>
            </div>
            <AuditTimeline events={t.audits} />
          </section>
        </div>
        <aside className="stack">
          <PaymentActions transaction={t} onUpdate={setData} />
          <section className="panel">
            <div className="panel-heading">
              <h2>Transparent risk</h2>
              <StatusBadge value={t.riskLevel} />
            </div>
            <div className="risk-score">
              <strong>{t.riskScore}</strong>
              <span>/ 100</span>
            </div>
            <div className="risk-track">
              <span style={{ width: `${t.riskScore}%` }} />
            </div>
            <p className="small muted">
              Risk informs review. It never overrides a hard policy restriction.
            </p>
            <div className="risk-contributors">
              {t.evaluation.riskContributors.length ? (
                t.evaluation.riskContributors.map((c) => (
                  <div key={c.code}>
                    <div>
                      <strong>{humanize(c.code)}</strong>
                      <span>+{c.points}</span>
                    </div>
                    <p>{c.explanation}</p>
                  </div>
                ))
              ) : (
                <p className="small muted">No additional risk contributors detected.</p>
              )}
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Payment references</h2>
              <FileCheck2 size={17} />
            </div>
            <dl className="reference-list">
              {[
                ["Mode", t.mode],
                ["State", t.status],
                ["PayPal status", t.paypalStatus],
                ["Order", t.paypalOrderId],
                ["Authorization", t.paypalAuthorizationId],
                ["Capture", t.paypalCaptureId],
                ["Receipt", t.receipt?.id],
                ["Quote hash", t.quoteHash],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd className="mono">{value || "Not created"}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="panel">
            <h3>Evaluation history</h3>
            {t.decisions.map((d) => (
              <details className="evaluation-history" key={d.id}>
                <summary>
                  {humanize(d.phase)} <StatusBadge value={d.result.decision} />
                </summary>
                <p className="small muted">{date(d.createdAt)}</p>
                <pre>{JSON.stringify(d.result, null, 2)}</pre>
              </details>
            ))}
          </section>
          {t.approvals.length > 0 && (
            <section className="panel">
              <h3>Human approval record</h3>
              {t.approvals.map((a) => (
                <div className="approval-record" key={a.id}>
                  <StatusBadge value={a.status} />
                  <strong>{money(a.amount, a.currency)}</strong>
                  <p>{a.decidedAt ? date(a.decidedAt) : "Awaiting decision"}</p>
                  <p className="mono small">{a.approverId || "No approver yet"}</p>
                </div>
              ))}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
