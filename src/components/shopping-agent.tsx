"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Check,
  Monitor,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { EmptyState, ErrorState, Loading, PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AiModeBadge } from "@/components/ai-mode-badge";
import { post, useResource } from "@/lib/client-api";
import type { Mandate, Product, Transaction } from "@/lib/client-types";
import { money } from "@/lib/utils";
export function ShoppingAgent({ initialMandate }: { initialMandate?: string }) {
  const router = useRouter();
  const mandates = useResource<Mandate[]>("/api/mandates");
  const catalog = useResource<Product[]>("/api/catalog");
  const [mandateId, setMandateId] = useState(initialMandate || "");
  const [query, setQuery] = useState("");
  const [productId, setProductId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = mandates.data?.filter((m) => m.status === "ACTIVE") || [];
  const selected = active.find((m) => m.id === mandateId) || active[0];
  const policy = selected?.versions[0]?.policy;
  const products =
    catalog.data?.filter((p) =>
      `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(query.toLowerCase()),
    ) || [];
  async function evaluate() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const tx = await post<Transaction>("/api/purchase/propose", {
        mandateId: selected.id,
        query,
        ...(productId ? { productId } : {}),
      });
      router.push(`/transactions/${tx.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to evaluate purchase");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="PROPOSE. EVALUATE. PROVE."
        title="Your shopping agent"
        description="Let the agent find a match. Let your mandate decide what happens next."
        action={<AiModeBadge />}
      />
      {mandates.error ? (
        <ErrorState message={mandates.error} retry={mandates.refresh} />
      ) : mandates.loading ? (
        <Loading />
      ) : !active.length ? (
        <EmptyState
          title="Your agent needs a mandate"
          description="Create and activate a spending mandate before proposing a purchase."
          action={
            <Button asChild>
              <Link href="/mandates/new">Create Spending Mandate</Link>
            </Button>
          }
        />
      ) : (
        <>
          <section className="agent-control panel">
            <div className="agent-control-main">
              <div className="field">
                <label htmlFor="active-mandate">Active spending mandate</label>
                <select
                  id="active-mandate"
                  className="input"
                  value={selected?.id || ""}
                  onChange={(e) => {
                    setMandateId(e.target.value);
                    setProductId("");
                  }}
                >
                  {active.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} · v{m.version}
                    </option>
                  ))}
                </select>
              </div>
              <div className="agent-policy-strip">
                <span>
                  <strong>{policy?.quantity ?? "Any"}</strong> items
                </span>
                <span>
                  <strong>{money(policy?.maxTotal || 0)}</strong> maximum
                </span>
                <span>
                  <strong>{money(policy?.autonomousLimit || 0)}</strong> autonomous
                </span>
                <Link href={`/mandates/${selected?.id}`}>
                  Inspect policy <ArrowRight size={12} />
                </Link>
              </div>
            </div>
            <div className="agent-boundary">
              <ShieldCheck size={22} />
              <p>
                The agent can propose.
                <br />
                <strong>Only policy can authorize.</strong>
              </p>
            </div>
          </section>
          <div className="section-heading">
            <div>
              <h2>Controlled product catalog</h2>
              <p>Merchant descriptions are untrusted data, never instructions.</p>
            </div>
            <Badge>{catalog.data?.length || 0} catalog products</Badge>
          </div>
          <div className="agent-search">
            <label className="search-input">
              <Search size={17} />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products, specifications, or a purchasing goal…"
                aria-label="Search product catalog"
              />
            </label>
            <Button variant={!productId ? "secondary" : "outline"} onClick={() => setProductId("")}>
              <Sparkles size={15} /> Let the agent choose
            </Button>
          </div>
          {error && <ErrorState message={error} />}{" "}
          {catalog.error ? (
            <ErrorState message={catalog.error} retry={catalog.refresh} />
          ) : catalog.loading ? (
            <Loading label="Loading product catalog…" />
          ) : !products.length ? (
            <EmptyState
              title="No catalog matches"
              description="Try searching for monitors, warranty, or cables."
            />
          ) : (
            <div className="catalog-grid">
              {products.map((p) => (
                <article
                  className={`product-card ${productId === p.id ? "selected" : ""}`}
                  key={p.id}
                >
                  <div className="product-visual">
                    <Monitor size={58} strokeWidth={1} />
                    <span>
                      {p.specifications.sizeInches
                        ? `${p.specifications.sizeInches}″`
                        : p.category.toUpperCase()}
                    </span>
                    {p.riskFlags.length > 0 && (
                      <Badge tone="red">
                        <TriangleAlert size={11} /> Untrusted content
                      </Badge>
                    )}
                  </div>
                  <div className="product-content">
                    <div className="inline spread">
                      <span className="eyebrow">{p.merchant.name}</span>
                      <Badge tone={p.condition === "new" ? "green" : "amber"}>{p.condition}</Badge>
                    </div>
                    <h3>{p.name}</h3>
                    <p>{p.description}</p>
                    <div className="product-specs">
                      {p.specifications.resolutionWidth && (
                        <span>
                          {p.specifications.resolutionWidth} × {p.specifications.resolutionHeight}
                        </span>
                      )}
                      <span>{p.category}</span>
                    </div>
                    {p.riskFlags.length > 0 && (
                      <div className="chip-row">
                        {p.riskFlags.map((flag) => (
                          <Badge tone="red" key={flag}>
                            {flag.replaceAll("_", " ")}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="product-bottom">
                      <div>
                        <strong>{money(p.priceCents / 100, p.currency)}</strong>
                        <span>per item</span>
                      </div>
                      <Button
                        variant={productId === p.id ? "secondary" : "outline"}
                        size="sm"
                        onClick={() => setProductId(productId === p.id ? "" : p.id)}
                        aria-pressed={productId === p.id}
                      >
                        {productId === p.id ? (
                          <>
                            <Check size={14} /> Selected
                          </>
                        ) : (
                          "Select product"
                        )}
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          <div className="agent-action-bar">
            <div>
              <Bot size={21} />
              <div>
                <strong>
                  {productId
                    ? catalog.data?.find((p) => p.id === productId)?.name
                    : "Agent selects the best candidate"}
                </strong>
                <p>
                  {productId
                    ? "The selected product will be proposed under your active mandate."
                    : "The agent will use your goal and catalog to propose a purchase."}
                </p>
              </div>
            </div>
            <Button disabled={busy || !selected} onClick={evaluate}>
              {busy ? "Evaluating proposal…" : "Evaluate Purchase"}
              <ArrowRight size={16} />
            </Button>
          </div>
        </>
      )}
    </>
  );
}
