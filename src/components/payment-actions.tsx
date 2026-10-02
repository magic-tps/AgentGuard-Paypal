"use client";
import { useState } from "react";
import { ArrowUpRight, CheckCircle2, LockKeyhole, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/shared";
import { post } from "@/lib/client-api";
import type { Transaction } from "@/lib/client-types";
import { money } from "@/lib/utils";
export function PaymentActions({
  transaction: t,
  onUpdate,
}: {
  transaction: Transaction;
  onUpdate: (value: Transaction) => void;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pending = t.approvals.find((a) => a.status === "PENDING");
  async function run(action: string) {
    setBusy(action);
    setError(null);
    try {
      let result: Transaction;
      if (action === "approve" || action === "reject") {
        if (!pending)
          throw new Error("This approval is no longer pending. Refresh the transaction.");
        result = await post(`/api/approvals/${pending.id}/${action}`);
      } else if (action === "checkout") {
        result = await post("/api/paypal/orders", { transactionId: t.id });
        onUpdate(result);
        if (
          result.mode === "SIMULATED" &&
          result.paypalOrderId &&
          result.status === "PAYPAL_ORDER_CREATED"
        )
          result = await post(`/api/paypal/orders/${result.paypalOrderId}/authorize`);
      } else if (action === "authorize") {
        result = await post(`/api/paypal/orders/${t.paypalOrderId}/authorize`);
      } else {
        result = await post(`/api/paypal/authorizations/${t.paypalAuthorizationId}/${action}`);
      }
      onUpdate(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment operation failed");
    } finally {
      setBusy("");
    }
  }
  const authorized = ["AUTHORIZED", "FINAL_POLICY_CHECK"].includes(t.status);
  const canStart = ["POLICY_CHECKED", "APPROVED"].includes(t.status);
  const canContinue = ["PAYPAL_ORDER_CREATED", "PAYER_APPROVED"].includes(t.status);
  return (
    <section className={`panel payment-panel state-${t.status.toLowerCase()}`}>
      <div className="panel-heading">
        <h2>Payment execution</h2>
        <Badge tone={t.mode === "SIMULATED" ? "neutral" : "teal"}>
          {t.mode === "SIMULATED" ? "SIMULATED" : "PAYPAL SANDBOX"}
        </Badge>
      </div>
      {t.status === "CAPTURED" ? (
        <div className="payment-outcome">
          <CheckCircle2 size={32} />
          <h3>{t.mode === "SIMULATED" ? "SIMULATED CAPTURED" : "Payment captured"}</h3>
          <p>
            {t.mode === "SIMULATED"
              ? "The complete authorization and capture flow was simulated. No PayPal payment was made."
              : "PayPal Sandbox capture completed after the final deterministic policy check."}
          </p>
          <strong>{money(t.amount, t.currency)}</strong>
        </div>
      ) : t.status === "BLOCKED" ? (
        <div className="payment-outcome blocked">
          <LockKeyhole size={28} />
          <h3>PAYPAL NOT EXECUTED</h3>
          <p>The deterministic firewall blocked this proposal. No payment order was created.</p>
        </div>
      ) : t.status === "VOIDED" ? (
        <div className="payment-outcome">
          <XCircle size={28} />
          <h3>{t.mode === "SIMULATED" ? "SIMULATED VOIDED" : "Authorization voided"}</h3>
          <p>The authorization was released. This transaction cannot be captured.</p>
        </div>
      ) : (
        <>
          <p className="small muted">
            {t.mode === "SIMULATED"
              ? "Demo payment adapter. All operations and payment identifiers are simulated."
              : "Orders use PayPal Sandbox with AUTHORIZE intent. Capture follows a fresh policy check."}
          </p>
          {pending && t.status === "REQUIRES_APPROVAL" ? (
            <div className="approval-action">
              <div className="review-amount">
                <span>Explicit approval required</span>
                <strong>{money(pending.amount, pending.currency)}</strong>
              </div>
              <p className="small">
                You are reviewing policy v{t.policyVersion.version} and the current quote. Approval
                triggers a fresh policy evaluation.
              </p>
              <div className="button-row">
                <Button disabled={!!busy} onClick={() => run("approve")}>
                  {busy === "approve" ? "Rechecking policy…" : "Approve"}
                </Button>
                <Button variant="destructive" disabled={!!busy} onClick={() => run("reject")}>
                  {busy === "reject" ? "Rejecting…" : "Reject"}
                </Button>
              </div>
            </div>
          ) : null}
          {canStart && (
            <Button className="full-width" disabled={!!busy} onClick={() => run("checkout")}>
              <ShieldCheck size={16} />
              {busy === "checkout"
                ? "Running payment checks…"
                : t.mode === "SIMULATED"
                  ? "Simulate checkout"
                  : "Create PayPal Sandbox order"}
            </Button>
          )}
          {canContinue && (
            <div className="stack">
              {t.approvalUrl && t.mode === "PAYPAL_SANDBOX" && (
                <Button asChild className="full-width">
                  <a href={t.approvalUrl} rel="noopener noreferrer" target="_blank">
                    Approve in PayPal Sandbox <ArrowUpRight size={16} />
                  </a>
                </Button>
              )}
              <p className="small muted">
                {t.mode === "PAYPAL_SANDBOX"
                  ? "After buyer approval in PayPal, continue here. The server verifies approval before authorization."
                  : "Continue the simulated authorization and final policy check."}
              </p>
              <Button
                variant="outline"
                className="full-width"
                disabled={!!busy}
                onClick={() => run("authorize")}
              >
                {busy === "authorize" ? "Verifying and authorizing…" : "Authorize & capture"}
              </Button>
            </div>
          )}
          {authorized && (
            <div className="button-row">
              <Button disabled={!!busy} onClick={() => run("capture")}>
                {busy === "capture" ? "Rechecking…" : "Retry final check & capture"}
              </Button>
              <Button variant="outline" disabled={!!busy} onClick={() => run("void")}>
                {busy === "void" ? "Voiding…" : "Void authorization"}
              </Button>
            </div>
          )}
          {t.status === "FAILED" && (
            <p className="small">
              The payment operation failed. Refresh this receipt to confirm the recorded state
              before proposing a new transaction.
            </p>
          )}
        </>
      )}
      {(error || t.lastError) && (
        <ErrorState message={error || t.lastError || "Operation failed"} />
      )}
      <div className="payment-security">
        <LockKeyhole size={13} />
        <span>Financial authorization is enforced on the server.</span>
      </div>
    </section>
  );
}
