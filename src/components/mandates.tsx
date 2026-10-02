"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  FileCheck2,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  AuditTimeline,
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  PolicySummary,
  StatusBadge,
} from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { api, post, useResource } from "@/lib/client-api";
import type { Mandate } from "@/lib/client-types";
import { DEFAULT_INTENT } from "@/lib/domain/demo";
import { spendingMandateSchema } from "@/lib/domain/schemas";
import { date, money } from "@/lib/utils";
import { AiModeBadge } from "@/components/ai-mode-badge";
export function MandatesList() {
  const { data, error, loading, refresh } = useResource<Mandate[]>("/api/mandates");
  return (
    <>
      <PageHeader
        eyebrow="CONTROL PLANE"
        title="Spending mandates"
        description="Your intent, translated into enforceable boundaries."
        action={
          <Button asChild>
            <Link href="/mandates/new">
              <Plus size={16} /> Create mandate
            </Link>
          </Button>
        }
      />
      <div className="section-intro">
        <ShieldCheck size={18} />
        <p>A mandate must be reviewed and explicitly activated before an agent can use it.</p>
      </div>
      {error ? (
        <ErrorState message={error} retry={refresh} />
      ) : loading ? (
        <Loading />
      ) : !data?.length ? (
        <EmptyState
          title="Start with your intent"
          description="Create a spending mandate to give your agent a clear scope of authority."
          action={
            <Button asChild>
              <Link href="/mandates/new">Create your first mandate</Link>
            </Button>
          }
        />
      ) : (
        <div className="mandates-list">
          {data.map((m) => {
            const p = m.versions[0]?.policy;
            return (
              <article className="mandate-row" key={m.id}>
                <div className="mandate-icon">
                  <FileCheck2 size={22} />
                </div>
                <div className="mandate-main">
                  <div className="inline">
                    <h3>
                      <Link href={`/mandates/${m.id}`}>{m.name}</Link>
                    </h3>
                    <StatusBadge value={m.status} />
                    <span className="mono small muted">v{m.version}</span>
                  </div>
                  <p>{p?.goal || m.originalIntent}</p>
                  <span className="small muted">Created {date(m.createdAt)}</span>
                </div>
                <div className="mandate-amount">
                  <span>MAX TOTAL</span>
                  <strong>{p ? money(p.maxTotal) : "—"}</strong>
                  <small>{p?.currency}</small>
                </div>
                <div className="mandate-amount">
                  <span>AUTONOMOUS</span>
                  <strong>{p ? money(p.autonomousLimit) : "—"}</strong>
                  <small>Human review above</small>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/mandates/${m.id}`}>
                    Manage <ArrowRight size={14} />
                  </Link>
                </Button>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
export function MandateBuilder() {
  const router = useRouter();
  const [intent, setIntent] = useState(DEFAULT_INTENT);
  const [name, setName] = useState("Workspace monitor upgrade");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Link href="/mandates" className="back-link">
        <ArrowLeft size={14} /> Spending mandates
      </Link>
      <PageHeader
        eyebrow="NEW SPENDING MANDATE"
        title="Start with your intent."
        description="Describe the purchase. Define the boundaries. Keep the final say."
      />
      <div className="builder-layout">
        <form
          className="panel builder-panel"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              const result = await post<Mandate>("/api/ai/compile-policy", { name, intent });
              router.push(`/mandates/${result.id}?review=1`);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Policy compilation failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="panel-heading">
            <span className="step-number">01</span>
            <h2>Describe your purchasing intent</h2>
          </div>
          <label className="field">
            Mandate name
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              placeholder="e.g. Workspace monitor upgrade"
            />
          </label>
          <div className="field">
            <label htmlFor="mandate-intent">What should your agent be allowed to buy?</label>
            <Textarea
              id="mandate-intent"
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              required
              minLength={20}
              maxLength={5000}
              rows={8}
              placeholder="Describe products, budget, constraints, and when to ask you…"
            />
          </div>
          <div className="inline spread">
            <span className="small muted">Be specific about what is—and isn’t—allowed.</span>
            <span className="mono small muted">{intent.length}/5000</span>
          </div>
          {error && <ErrorState message={error} />}
          <div className="form-footer">
            <AiModeBadge />
            <Button type="submit" disabled={busy}>
              {busy ? <span className="spin">◌</span> : <Sparkles size={16} />}{" "}
              {busy ? "Compiling policy…" : "Generate Policy"}
            </Button>
          </div>
        </form>
        <aside className="builder-aside">
          <div className="eyebrow">A GOOD MANDATE DEFINES</div>
          {[
            {
              n: "01",
              title: "A clear objective",
              text: "What to buy, how many, and the specifications that matter.",
            },
            {
              n: "02",
              title: "A hard spending ceiling",
              text: "The maximum total your agent can never exceed.",
            },
            {
              n: "03",
              title: "Your approval threshold",
              text: "When the agent should pause and ask you first.",
            },
            {
              n: "04",
              title: "Explicit exclusions",
              text: "Conditions, merchants, or add-ons that are out of bounds.",
            },
          ].map((item) => (
            <div className="builder-tip" key={item.n}>
              <span>{item.n}</span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.text}</p>
              </div>
            </div>
          ))}
          <div className="trust-note">
            <ShieldCheck size={21} />
            <p>
              AI interprets intent. <strong>You review and activate.</strong> Generated policies are
              saved as drafts.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
export function MandateDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: m, setData, error, loading, refresh } = useResource<Mate>(`/api/mandates/${id}`);
  const [confirmed, setConfirmed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [json, setJson] = useState("");
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  async function act(action: string) {
    if (!m) return;
    setBusy(action);
    setActionError(null);
    setNotice("");
    try {
      let policy;
      if (action === "edit") {
        try {
          policy = spendingMandateSchema.parse(JSON.parse(json));
        } catch {
          throw new Error(
            "The policy is not valid. Check all fields, USD amounts, and ensure thresholds do not exceed the maximum total.",
          );
        }
      }
      const result = await api<Mandate>(`/api/mandates/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          action,
          expectedVersion: m.version,
          ...(action === "activate" ? { confirmed } : {}),
          ...(action === "edit" ? { policy, name: editName } : {}),
        }),
      });
      if (action === "clone") {
        router.push(`/mandates/${result.id}`);
        return;
      }
      setData(result);
      setConfirmed(false);
      setEditing(false);
      setNotice(
        action === "activate"
          ? "Mandate activated. The agent can now propose purchases within this policy."
          : action === "edit"
            ? "New draft version saved. Review and activate it before use."
            : "Mandate deactivated.",
      );
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Unable to update mandate");
    } finally {
      setBusy("");
    }
  }
  if (error) return <ErrorState message={error} retry={refresh} />;
  if (loading || !m) return <Loading />;
  const latest = m.versions[0];
  return (
    <>
      <Link href="/mandates" className="back-link">
        <ArrowLeft size={14} /> Spending mandates
      </Link>
      <PageHeader
        eyebrow={`MANDATE / VERSION ${m.version}`}
        title={m.name}
        description="A versioned agreement between you and your agent."
        action={
          <>
            <StatusBadge value={m.status} />
            <Button variant="outline" size="sm" disabled={!!busy} onClick={() => act("clone")}>
              <Copy size={14} /> Clone
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditing(!editing);
                setJson(JSON.stringify(latest.policy, null, 2));
                setEditName(m.name);
              }}
            >
              <Pencil size={14} /> {editing ? "Cancel edit" : "Edit policy"}
            </Button>
          </>
        }
      />
      {actionError && <ErrorState message={actionError} />}{" "}
      {notice && (
        <div className="success-note" role="status">
          <Check size={16} />
          {notice}
        </div>
      )}
      <div className="detail-layout">
        <div className="stack">
          <section className="panel">
            <div className="panel-heading">
              <h2>Original human intent</h2>
              <Badge>HUMAN AUTHORED</Badge>
            </div>
            <blockquote className="intent-quote">“{m.originalIntent}”</blockquote>
            <div className="metadata-line">
              <span>Compiled by {latest.model}</span>
              <span>{date(latest.createdAt)}</span>
            </div>
          </section>
          {editing ? (
            <section className="panel">
              <h2>Edit structured policy</h2>
              <p className="muted small">
                Saving creates a new draft version. Existing authorization does not carry forward.
              </p>
              <label className="field">
                Mandate name
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={120}
                />
              </label>
              <label className="field">
                Spending policy JSON
                <Textarea
                  className="code-editor"
                  value={json}
                  onChange={(e) => setJson(e.target.value)}
                  spellCheck={false}
                  rows={22}
                />
              </label>
              <Button disabled={!!busy} onClick={() => act("edit")}>
                {busy === "edit" ? "Saving…" : "Save new draft version"}
              </Button>
            </section>
          ) : (
            <section className="panel">
              <div className="panel-heading">
                <h2>Structured spending policy</h2>
                <span className="mono small muted">v{m.version} · USD</span>
              </div>
              <PolicySummary policy={latest.policy} />
              <details className="raw-policy">
                <summary>View machine-readable policy</summary>
                <pre>{JSON.stringify(latest.policy, null, 2)}</pre>
              </details>
            </section>
          )}
          <section className="panel">
            <div className="panel-heading">
              <h2>Mandate audit history</h2>
              <Badge>{m.audits.length} events</Badge>
            </div>
            <AuditTimeline events={m.audits} />
          </section>
        </div>
        <aside className="stack">
          <section className={`panel activation-panel ${m.status === "ACTIVE" ? "is-active" : ""}`}>
            <ShieldCheck size={27} />
            <h2>
              {m.status === "ACTIVE" ? "Your boundary is active" : "Review. Confirm. Activate."}
            </h2>
            <p>
              {m.status === "ACTIVE"
                ? "Every proposed purchase is evaluated against this exact policy version."
                : "Read the generated policy carefully. Activation grants the agent only the authority written here."}
            </p>
            {m.status !== "ACTIVE" ? (
              <>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  <span>
                    I reviewed this policy and explicitly authorize its spending limits and
                    constraints.
                  </span>
                </label>
                <Button
                  className="full-width"
                  disabled={!confirmed || !!busy || editing}
                  onClick={() => act("activate")}
                >
                  {busy === "activate" ? "Activating…" : "Activate mandate"}
                  <ArrowRight size={16} />
                </Button>
              </>
            ) : (
              <>
                <Button asChild className="full-width">
                  <Link href={`/agent?mandate=${id}`}>
                    Open shopping agent <ArrowRight size={16} />
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  className="full-width"
                  disabled={!!busy}
                  onClick={() => act("deactivate")}
                >
                  Deactivate mandate
                </Button>
              </>
            )}
          </section>
          <section className="panel">
            <h3>Version history</h3>
            <div className="version-list">
              {m.versions.map((v) => (
                <details key={v.id}>
                  <summary>
                    <span className="mono">Version {v.version}</span>
                    <span>{v.confirmedAt ? "Confirmed" : "Draft"}</span>
                  </summary>
                  <p className="small muted">
                    {date(v.createdAt)} · {v.model}
                  </p>
                  <pre>{JSON.stringify(v.policy, null, 2)}</pre>
                </details>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
type Mate = Mandate;
