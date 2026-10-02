import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  FileCheck2,
  Fingerprint,
  LockKeyhole,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  Wallet,
} from "lucide-react";
import { Architecture, Logo } from "@/components/shared";
import { Button } from "@/components/ui/button";
export default function Home() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <Logo />
        <nav aria-label="Landing navigation">
          <a href="#how-it-works">How it works</a>
          <Link href="/attack-lab">Attack Lab</Link>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard">
              Open console <ArrowUpRight size={14} />
            </Link>
          </Button>
        </nav>
      </header>
      <main id="main-content">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="live-dot" /> AUTONOMOUS COMMERCE. HUMAN CONTROL.
            </div>
            <h1>
              The trust layer
              <br />
              between AI agents
              <br />
              and <span>your money.</span>
            </h1>
            <p>Give AI agents purchasing power without giving them unrestricted control.</p>
            <div className="hero-actions">
              <Button asChild>
                <Link href="/mandates/new">
                  Create Spending Mandate <ArrowRight size={17} />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/attack-lab">
                  Open Attack Lab <ArrowUpRight size={17} />
                </Link>
              </Button>
            </div>
            <div className="hero-footnote">
              <ShieldCheck size={16} />
              <span>Human intent. Deterministic controls. Auditable decisions.</span>
            </div>
          </div>
          <div className="hero-visual">
            <div className="hero-receipt">
              <div className="hero-receipt-top">
                <Logo />
                <span className="mono">DECISION RECEIPT / EXAMPLE</span>
              </div>
              <div className="receipt-example-title">
                <span className="eyebrow">YOUR MANDATE</span>
                <h2>
                  Upgrade the workspace.
                  <br />
                  Stay within the boundary.
                </h2>
              </div>
              <div className="example-intent">
                3 new 27″ QHD monitors
                <br />
                No warranties. No accessories.
              </div>
              <div className="example-amount">
                <div>
                  <span>PROPOSED TOTAL</span>
                  <strong>
                    $537<span>.00</span>
                  </strong>
                </div>
                <span className="example-allow">
                  <Check size={14} /> ALLOW
                </span>
              </div>
              <div className="example-budget">
                <div />
                <span />
              </div>
              <div className="example-budget-labels">
                <span>$600 autonomous</span>
                <span>$700 maximum</span>
              </div>
              <div className="example-checks">
                {["Budget respected", "Specifications matched", "No unauthorized add-ons"].map(
                  (s) => (
                    <div key={s}>
                      <Check size={14} />
                      <span>{s}</span>
                      <span>PASS</span>
                    </div>
                  ),
                )}
              </div>
              <div className="example-receipt-footer">
                <LockKeyhole size={13} />
                <span>Policy verified before payment</span>
                <Fingerprint size={25} />
              </div>
            </div>
            <div className="hero-boundary-label">
              <span>THE AUTHORIZATION BOUNDARY</span>
              <span>↳ Every purchase must prove compliance.</span>
            </div>
          </div>
        </section>
        <section className="landing-statement">
          <span className="eyebrow">INTELLIGENCE IS NOT AUTHORIZATION.</span>
          <p>
            AI agents can spend money.
            <br />
            <strong>
              AgentGuard makes sure they spend it
              <br />
              exactly as humans intended.
            </strong>
          </p>
        </section>
        <section className="landing-architecture" id="how-it-works">
          <div className="section-heading">
            <div>
              <span className="eyebrow">ONE CLEAR SEPARATION OF RESPONSIBILITY</span>
              <h2>
                AI interprets intent.
                <br />
                Deterministic controls authorize money movement.
              </h2>
            </div>
            <span className="architecture-index">01 — 05</span>
          </div>
          <Architecture />
          <p>
            Every AI transaction must prove that it complies with the human&apos;s mandate before
            PayPal executes it.
          </p>
        </section>
        <section className="landing-benefits">
          <div className="benefits-title">
            <span className="eyebrow">BUILT AROUND YOUR BOUNDARIES</span>
            <h2>
              More autonomy.
              <br />
              Clearer control.
            </h2>
            <Link href="/dashboard" className="text-link">
              Explore the console <ArrowRight size={16} />
            </Link>
          </div>
          <div className="benefits-list">
            {[
              {
                icon: Fingerprint,
                title: "Intent enforcement",
                text: "Your natural-language intent becomes an explicit, versioned spending policy.",
              },
              {
                icon: SlidersHorizontal,
                title: "Spending limits",
                text: "Hard ceilings and autonomous thresholds are checked by deterministic code.",
              },
              {
                icon: UserCheck,
                title: "Human approvals",
                text: "An exact quote. An explicit decision. A permanent record of your approval.",
              },
              {
                icon: ShieldCheck,
                title: "Adversarial protection",
                text: "Untrusted merchant instructions cannot redefine your purchasing authority.",
              },
              {
                icon: FileCheck2,
                title: "Transaction auditability",
                text: "Inspect every check, risk contributor, approval, and payment operation.",
              },
              {
                icon: Wallet,
                title: "PayPal execution",
                text: "Authorize, recheck, then capture. Sandbox and simulation are clearly distinguished.",
              },
            ].map(({ icon: Icon, title, text }, i) => (
              <div key={title} className="benefit">
                <span className="mono">0{i + 1}</span>
                <Icon size={21} />
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="landing-lab">
          <div>
            <span className="eyebrow">DON’T TAKE THE BOUNDARY ON FAITH.</span>
            <h2>Try to break it.</h2>
            <p>
              Budget attacks. Hidden add-ons. Prompt injections.
              <br />
              Seven scenarios. One deterministic firewall.
            </p>
          </div>
          <Button asChild>
            <Link href="/attack-lab">
              Enter the Attack Lab <ArrowUpRight size={18} />
            </Link>
          </Button>
        </section>
      </main>
      <footer className="landing-footer">
        <Logo />
        <p>The trust layer between AI agents and your money.</p>
        <span>Built for accountable autonomy.</span>
      </footer>
    </div>
  );
}
