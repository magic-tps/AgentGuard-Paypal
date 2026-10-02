"use client";
import { AlertCircle, ArrowRight, Check, Loader2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { date, humanize, money } from "@/lib/utils";
import type { Audit } from "@/lib/client-types";
import type { SpendingPolicy } from "@/lib/domain/schemas";
export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className={`brand ${light ? "brand-light" : ""}`} aria-label="AgentGuard home">
      <span className="brand-mark">
        <ShieldCheck size={22} />
      </span>
      <span>
        AgentGuard<span className="brand-period">.</span>
      </span>
    </Link>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="heading-actions">{action}</div>}
    </header>
  );
}
export function StatusBadge({ value, mode }: { value: string; mode?: string }) {
  const tone = ["ALLOW", "ACTIVE", "APPROVED", "LOW"].includes(value)
    ? "green"
    : ["BLOCK", "BLOCKED", "CRITICAL", "HIGH", "FAILED"].includes(value)
      ? "red"
      : ["REQUIRE_APPROVAL", "REQUIRES_APPROVAL", "MEDIUM", "PENDING"].includes(value)
        ? "amber"
        : value === "CAPTURED"
          ? "teal"
          : "neutral";
  return (
    <Badge tone={tone}>
      {mode === "SIMULATED" && value === "CAPTURED"
        ? "SIMULATED CAPTURED"
        : ["ALLOW", "BLOCK", "REQUIRE_APPROVAL"].includes(value)
          ? value.replaceAll("_", " ")
          : humanize(value)}
    </Badge>
  );
}
export function Loading({ label = "Loading your workspace…" }: { label?: string }) {
  return (
    <div className="loading-state" role="status">
      <Loader2 size={22} className="spin" />
      <span>{label}</span>
    </div>
  );
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={19} />
      <div>
        <strong>Something needs attention</strong>
        <p>{message}</p>
      </div>
      {retry && (
        <Button variant="outline" size="sm" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <ShieldCheck size={30} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Architecture({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`architecture ${compact ? "compact" : ""}`}
      aria-label="Human intent to AI agent to AgentGuard deterministic firewall to PayPal to merchant"
    >
      {["Human intent", "AI agent", "AgentGuard", "PayPal", "Merchant"].map((name, i) => (
        <div className="architecture-part" key={name}>
          <div className={i === 2 ? "architecture-node guard" : "architecture-node"}>
            {i === 2 && <ShieldCheck size={20} />}
            <strong>{name}</strong>
            {!compact && (
              <span>
                {
                  [
                    "You set the boundaries",
                    "Proposes a purchase",
                    "Deterministic firewall",
                    "Executes payment",
                    "Fulfills the order",
                  ][i]
                }
              </span>
            )}
          </div>
          {i < 4 && <ArrowRight size={17} />}
        </div>
      ))}
    </div>
  );
}
export function PolicySummary({ policy }: { policy: SpendingPolicy }) {
  return (
    <div className="policy-summary">
      <div className="policy-budget">
        <div>
          <span className="eyebrow">Hard spending limit</span>
          <strong>{money(policy.maxTotal)}</strong>
        </div>
        <div>
          <span className="eyebrow">Autonomous authority</span>
          <strong>{money(policy.autonomousLimit)}</strong>
        </div>
      </div>
      <div className="budget-track">
        <span
          style={{ width: `${Math.min(100, (policy.autonomousLimit / policy.maxTotal) * 100)}%` }}
        />
      </div>
      <p className="small muted">
        Human approval above {money(policy.requireHumanApprovalAbove)} · {policy.currency}
      </p>
      <dl className="details-list">
        <div>
          <dt>Goal</dt>
          <dd>{policy.goal}</dd>
        </div>
        <div>
          <dt>Quantity</dt>
          <dd>{policy.quantity ?? "Not specified"}</dd>
        </div>
        <div>
          <dt>Category</dt>
          <dd>{policy.productConstraints.category ?? "Any"}</dd>
        </div>
        <div>
          <dt>Condition</dt>
          <dd>{policy.productConstraints.allowedConditions?.join(", ") ?? "Any"}</dd>
        </div>
        {policy.productConstraints.minimumSizeInches && (
          <div>
            <dt>Minimum size</dt>
            <dd>{policy.productConstraints.minimumSizeInches} inches</dd>
          </div>
        )}
        {policy.productConstraints.minimumResolutionWidth && (
          <div>
            <dt>Minimum resolution</dt>
            <dd>
              {policy.productConstraints.minimumResolutionWidth} ×{" "}
              {policy.productConstraints.minimumResolutionHeight}
            </dd>
          </div>
        )}
        {policy.allowedMerchants?.length ? (
          <div>
            <dt>Allowed merchants</dt>
            <dd>{policy.allowedMerchants.join(", ")}</dd>
          </div>
        ) : null}
        {policy.blockedMerchants?.length ? (
          <div>
            <dt>Blocked merchants</dt>
            <dd>{policy.blockedMerchants.join(", ")}</dd>
          </div>
        ) : null}
        {policy.productConstraints.requiredKeywords?.length ? (
          <div>
            <dt>Required keywords</dt>
            <dd>{policy.productConstraints.requiredKeywords.join(", ")}</dd>
          </div>
        ) : null}
      </dl>
      <div className="forbidden">
        <span className="eyebrow">Forbidden items</span>
        <div className="chip-row">
          {policy.forbidden.length ? (
            policy.forbidden.map((item) => (
              <Badge tone="red" key={item}>
                {item}
              </Badge>
            ))
          ) : (
            <span className="small muted">No additional exclusions</span>
          )}
        </div>
      </div>
    </div>
  );
}
export function AuditTimeline({ events }: { events: Audit[] }) {
  return events.length ? (
    <ol className="audit-timeline">
      {events.map((event) => (
        <li key={event.id}>
          <span className="audit-dot">
            <Check size={11} />
          </span>
          <div>
            <strong>{humanize(event.type)}</strong>
            <p>
              {event.actor} · {date(event.createdAt)}
            </p>
            <details>
              <summary>Event evidence</summary>
              <pre>{JSON.stringify(event.metadata, null, 2)}</pre>
            </details>
          </div>
        </li>
      ))}
    </ol>
  ) : (
    <p className="muted small">No audit events yet.</p>
  );
}
