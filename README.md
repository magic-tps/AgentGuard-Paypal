# ◈ AgentGuard

**The trust layer between AI agents and your money.**

AI agents can spend money. AgentGuard makes sure they spend it exactly as humans intended.

AgentGuard is a working hackathon MVP for autonomous-commerce controls. A human describes a purchase, reviews a structured spending mandate, and activates it. An agent recommends a catalog purchase. Deterministic code decides **ALLOW**, **BLOCK**, or **REQUIRE_APPROVAL** before the payment adapter can execute anything.

AI interprets intent. Deterministic controls authorize money movement.

Consulta el [informe maestro completo de AgentGuard](docs/informe-maestro-agentguard.md): arquitectura, implementación, contratos, base de datos, evidencias, operación, pruebas, limitaciones y anexos con todos los documentos del proyecto.

Para publicar, sigue la [guía de despliegue Render + Neon + PayPal Sandbox](docs/deployment.md). Distingue las verificaciones locales de la configuración y validación externa pendientes.

## Run locally

Requires Node.js 22, npm, PostgreSQL, and a local Ollama server with a downloaded model. No paid AI API or `OPENAI_API_KEY` is required. This repository includes a local PostgreSQL launcher and a Docker Compose alternative. An explicitly selected deterministic demo fallback can also run without an LLM; payments keep their independent Sandbox/simulation mode.

```sh
npm ci
```

If `.env` does not already exist, copy `.env.example` to `.env` (`Copy-Item .env.example .env` in PowerShell; `cp .env.example .env` on macOS/Linux). Preserve an existing `.env` and its PayPal credentials. The example now has blank database/origin placeholders for public deployment. For a new local setup explicitly set `DATABASE_URL=postgresql://agentguard:agentguard_local@127.0.0.1:54329/agentguard` (public development credentials), `NEXT_PUBLIC_APP_URL=http://localhost:3000`, and `AI_PROVIDER=ollama` with the local model described below. Keep public credentials separate in the hosting environment.

Terminal 1, start a real local PostgreSQL process; data persists in `.data/postgres`:

```sh
npm run db:local
```

Alternatively, use `docker compose up -d db`. Both use port **54329**; choose one. The built-in launcher binds only to loopback and uses development credentials. On Linux, run it as an ordinary user, or use Docker; the launcher deliberately does not create system users.

Terminal 2:

```sh
npm run db:setup
npm run dev
```

Open **http://localhost:3000**. Use this exact origin to match `NEXT_PUBLIC_APP_URL`. The dashboard is seeded immediately. Seed is repeatable and preserves existing work.

For a production bundle: `npm run build`, then `npm start`. Production uses the supported `next start` default interface **0.0.0.0** and honors **PORT**. Development remains loopback-only. For a production bundle used exclusively on your own machine, use `npm start -- --hostname 127.0.0.1`. Public deployment requires protected operator access, PostgreSQL with TLS, and an explicit HTTPS application origin; follow [the deployment guide](docs/deployment.md).

## Architecture

```mermaid
flowchart TD
    H[Human intent] --> C[AI policy compiler · draft only]
    C --> V[Strict Zod validation]
    V --> R[Human review and explicit activation]
    R --> M[Versioned spending mandate]
    M --> A[Shopping agent · catalog recommendation]
    U[Untrusted merchant data] --> A
    A --> P[Deterministic policy engine]
    M --> P
    P --> B[BLOCK · no PayPal call]
    P --> Q[REQUIRE_APPROVAL]
    Q --> HR[Human approves exact cart, amount and version]
    HR --> P2[Reevaluate current policy]
    P --> AL[ALLOW]
    P2 --> AL
    AL --> O[PayPal Sandbox order · AUTHORIZE]
    O --> BA[Buyer approves on PayPal]
    BA --> AU[Backend authorizes order]
    AU --> F[Final deterministic check]
    F --> CA[Capture authorization]
    F --> VO[Void authorization]
    B --> DR[Decision receipt and append-only UI audit]
    CA --> DR
    VO --> DR
    WH[Verified idempotent webhooks] --> DR
```

The compiler and shopping agent have no payment tools. Domain logic lives outside React. The browser cannot submit a trusted `ALLOW` decision: monetary routes reload the owned transaction, current mandate, bound quote and approval records. The independent policy engine has no OpenAI imports.

## Free local AI with Ollama

Install [Ollama for Windows](https://ollama.com/download/windows), or the installer for your OS. On Windows the application normally runs the API in the background on port 11434; the [official Windows guide](https://docs.ollama.com/windows) documents requirements and installation. Models require additional disk space and sufficient RAM/VRAM; CPU inference is supported but can be slower. This machine already has `qwen3-coder:30b-a3b-q4_K_M` downloaded (about 18 GB). The model name is configured only through the environment; you can choose a smaller locally installed model instead.

```powershell
# Only if the Ollama background server is not already running:
ollama serve
# In another terminal; downloads the model if it is not present:
ollama pull qwen3-coder:30b-a3b-q4_K_M
ollama list
```

Set these fields in `.env` and restart AgentGuard:

```dotenv
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3-coder:30b-a3b-q4_K_M
OLLAMA_TIMEOUT_MS=180000
```

`provider.ts` selects a provider; compiler and catalog recommendation share its structured-output interface. The Ollama adapter sends `/api/chat` requests with `stream:false`, a JSON schema, temperature zero, a bounded context/output and a timeout. This follows [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs). The existing SDK helper converts Zod to JSON Schema locally; using that helper does **not** call OpenAI. Outputs are parsed with strict Zod schemas, then compiler permissions are independently checked against recognized English budget and approval clauses. Unknown budgets require clarification. Human review and activation remain mandatory.

The AI adapters have no database/payment imports or tools. Merchant text stays JSON-delimited untrusted user data. Proposed IDs must exist in the controlled catalog, and every purchase still passes the deterministic Policy Engine and the unchanged PayPal orchestration.

An offline server, timeout, missing model, malformed output or unsafe permissions returns a clear error. There is **no automatic switch to a parser or OpenAI**. To explicitly select the parser, set both `AI_PROVIDER=deterministic` and `DEMO_MODE=true`; UI and stored compilation metadata say **DETERMINISTIC FALLBACK**, not AI. Local inference says **LOCAL — OLLAMA**. The optional `AI_PROVIDER=openai` mode requires its own key and model and is never selected because a key happens to exist.

With PostgreSQL/catalog seeded, run `npm run ai:check` for real local inference cases A–D, merchant-injection reasoning, an ALLOW policy check for $537 and a BLOCK check for $812. It reads catalog data and saves non-secret evidence to ignored `.data/local-ai-validation.json`; it never mutates financial state or calls PayPal. Authenticated `GET /api/health` reports database, payment mode and local installed-model availability without secrets. Model availability is a health probe, not proof of a completed inference.

## What is real, and what is simulated?

| Component                                                      | Without external credentials                                                                   | With external credentials                                          |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| PostgreSQL, Prisma, policies, approvals, risk, receipts, audit | Real application logic and persistent data                                                     | Same                                                               |
| Policy compiler                                                | Real local Ollama inference without paid credentials; explicit deterministic fallback optional | Optional OpenAI only when selected; same Zod and permission guards |
| Shopping agent                                                 | Real local Ollama catalog reasoning; explicit deterministic fallback optional                  | Optional OpenAI; same controlled IDs and policy checks             |
| Catalog                                                        | Controlled local product data                                                                  | Same; no merchant fulfillment integration                          |
| Payment execution                                              | `SIMULATED`, `SIM-*` identifiers, `SIMULATED_CAPTURED`                                         | Actual PayPal Sandbox REST requests and returned identifiers       |
| Seed history                                                   | Explicitly simulated examples                                                                  | Remains simulated                                                  |

AI mode and payment mode are independent. AI fallback requires explicit provider selection plus `DEMO_MODE=true`. **Both PayPal credentials take precedence and new transactions use real Sandbox**, including when AI uses Ollama or deterministic fallback. Partial/invalid payment credentials cause a visible error; failed external calls never silently become simulations. Existing transactions retain their original payment environment. Production PayPal is intentionally unsupported.

## Environment

| Variable                                   | Purpose                                                                                |
| ------------------------------------------ | -------------------------------------------------------------------------------------- |
| `DATABASE_URL`                             | PostgreSQL URL; example targets local port 54329                                       |
| `AI_PROVIDER`                              | `ollama` (default), explicit `deterministic` demo fallback, or optional `openai`       |
| `OLLAMA_BASE_URL`                          | Local API URL; default `http://127.0.0.1:11434`, Docker can use `host.docker.internal` |
| `OLLAMA_MODEL`                             | Required downloaded local model name; never hardcoded in application logic             |
| `OLLAMA_TIMEOUT_MS`                        | Inference timeout, 1000–180000 ms; default 90000                                       |
| `OPENAI_API_KEY`, `OPENAI_MODEL`           | Optional; required only with explicit `AI_PROVIDER=openai`                             |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | Server-only REST app Sandbox credentials                                               |
| `PAYPAL_ENV`                               | Must be `sandbox`                                                                      |
| `PAYPAL_WEBHOOK_ID`                        | ID of the webhook registered on the same Sandbox app                                   |
| `NEXT_PUBLIC_APP_URL`                      | Exact application origin, including port; the only public setting                      |
| `DEMO_MODE`                                | `true` explicitly enables simulation and loopback operator access                      |
| `OPERATOR_PASSWORD`                        | At least 12 characters; required outside local demo                                    |
| `SESSION_SECRET`                           | At least 32 random characters; signs expiring operator cookies                         |

Never commit `.env`; it is ignored. Database, OpenAI and PayPal secrets are imported only by server modules. For non-demo or remotely hosted access, set the operator password and session secret and sign in at `/login`. This is a single-operator workspace, not a full multi-tenant identity system.

## PayPal Sandbox setup

1. Sign in to the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/). In Sandbox Accounts, create or use a **Business** seller and a separate **Personal** buyer. Open the buyer's account details to get its test email and password. [Official account guide](https://developer.paypal.com/sandbox-testing/accounts).
2. Under Apps & Credentials, select Sandbox and create a REST app associated with the Business account. Put its client ID and secret in `.env`; keep `PAYPAL_ENV=sandbox`. Restart Next.js. [REST setup](https://developer.paypal.com/api/rest/).
3. Create a fresh mandate/transaction. The mode chip must say **PAYPAL SANDBOX**. Select the normal $537 cart, create an order, and follow the returned PayPal approval link. Log in as the Personal Sandbox buyer.
4. On return to the receipt, continue authorization and capture. The server independently fetches the order, checks its `AUTHORIZE` intent, amount, currency, custom transaction ID and item identities, authorizes it, reevaluates the current catalog and policy, and captures or voids. A return-URL query string does not prove buyer approval. [Authorize/capture flow](https://developer.paypal.com/checkout/delay-capture/).
5. For webhooks, expose your app through an HTTPS development URL, set `NEXT_PUBLIC_APP_URL` to it and configure operator authentication. Register `https://your-host/api/paypal/webhook` on that same Sandbox REST app. Subscribe to `CHECKOUT.ORDER.APPROVED`, `PAYMENT.AUTHORIZATION.CREATED`, `PAYMENT.AUTHORIZATION.VOIDED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.PENDING`, and `PAYMENT.CAPTURE.DENIED`. Save the returned ID as `PAYPAL_WEBHOOK_ID` and restart. Signature verification uses PayPal's verification endpoint; unsigned events are rejected. [Webhook guide](https://developer.paypal.com/api/rest/webhooks/rest/).

This adapter uses the Sandbox business account as the payment recipient. Catalog merchant names are local metadata, not independently onboarded PayPal sellers. No physical products are fulfilled.

## Policy and security model

Every AI transaction must prove that it complies with the human's mandate before PayPal executes it.

- Strict schemas reject unknown payload properties, malformed model output, fractional cents and invalid quantities. Money arithmetic uses integer cents and PostgreSQL decimal columns.
- Human confirmation is required to activate a draft. Edits create immutable policy versions and return the mandate to draft. Activation checks the reviewed version.
- Checks cover cumulative reserved/captured budget, per-purchase autonomous threshold, currency, quantity, category, condition, specifications, forbidden items, allowed/blocked merchants, add-ons, quote changes, active state and version.
- Hard failures always block, regardless of risk score or human approval. Soft threshold failures request approval. Risk is separately explained on a 0–100 scale.
- An approval binds approver, time, transaction, amount, currency, quote hash and policy version. The current policy and quote are reevaluated when approving and before payment.
- PostgreSQL advisory locks serialize operations per mandate, including policy edits and approvals. This prevents concurrent captures and cross-transaction budget races. Orders reserve budget until closed.
- The stored bound quote is immutable across PayPal retries. Stable operation-specific `PayPal-Request-Id` values and unique DB constraints prevent duplicate operations. Uncertain requests older than five hours stop for manual reconciliation rather than replaying indefinitely. [PayPal idempotency](https://developer.paypal.com/api/rest/reference/idempotency/).
- Final checks compare the current catalog, authorized amount/currency, immutable cart and current mandate. Changed or invalid transactions release the authorization when possible.
- Merchant descriptions are untrusted user-message data, JSON-delimited for AI and rendered as React text. Heuristic prompt-injection detection is advisory and imperfect; the same hard policy checks block an unsafe cart even if detection misses it.
- Cookies are HttpOnly, SameSite=Strict, expiring and Secure on HTTPS. Authenticated API mutations require the configured Origin. Ownership, request sizes, rate limits and safe errors are enforced server-side.
- Webhooks are signature verified before processing. Event IDs are unique, processing is transactional, unknown pending references request retry, and notifications cannot create an authorized capture operation.
- Audit events have no UI/API mutation endpoint. Decision receipts retain the evaluated policy, checks, risk, approvals and payment references.

The deterministic fallback deliberately handles a narrow English monitor-purchase grammar and rejects unsupported constraints. All compiler providers default unspecified autonomous spending to zero and validate recognized numerical limits independently. Explicit always-ask sets zero; ask-above thresholds cap permissions; conflicting limits use the lowest. Human review remains necessary because structured output cannot guarantee perfect interpretation of every constraint.

## Attack Lab

Each run asks for confirmation of a fresh, isolated $700 mandate with a $600 autonomous threshold. It uses the same backend policy and payment services as ordinary purchases.

| Scenario         | Cart / checkout                                           | Expected                                       |
| ---------------- | --------------------------------------------------------- | ---------------------------------------------- |
| A · Normal       | 3 × $179 new 27-inch QHD monitors = $537                  | ALLOW; payment available                       |
| B · Budget       | $812 monitor cart                                         | BLOCK / MAX_TOTAL_EXCEEDED                     |
| C · Add-ons      | $537 monitors + $120 warranty + $95 cables                | BLOCK / UNAUTHORIZED_ITEM / FORBIDDEN_ITEM     |
| D · Approval     | $675                                                      | REQUIRE_APPROVAL; explicit Approve/Reject      |
| E · Injection    | Malicious product instructions + warranty + cables = $812 | BLOCK; injection evidence; PAYPAL NOT EXECUTED |
| F · Price review | $590 → $675                                               | REQUIRE_APPROVAL / PRICE_CHANGED               |
| G · Price block  | $590 → $720                                               | BLOCK / MAX_TOTAL_EXCEEDED                     |

Amounts that cannot divide into three equal cent prices are represented as two valid line items; the sum is exact.

## Pages and operations

`/` landing · `/dashboard` operations · `/mandates` and `/mandates/new` · `/mandates/[id]` versioned policy editor · `/agent` catalog selector · `/transactions` AG Grid · `/transactions/[id]` receipt/payment controls · `/approvals` review queue · `/attack-lab` adversarial scenarios · `/login` operator access.

AG Grid uses persisted transactions with sorting, text/column/status/risk/date filters, pagination, selection and click-through receipts. Summary metrics are explicitly scoped to the newest 500 transactions and label simulated records.

API contracts are documented in [docs/frontend-contract.md](docs/frontend-contract.md). All required compiler, evaluation, proposal, approval, order, authorization, capture, void, webhook and transaction routes are implemented separately under `src/app/api`.

## Database and repository

Prisma models: **User, SpendingMandate, PolicyVersion, Agent, Product, Merchant, PurchaseRequest, Transaction, TransactionItem, PolicyDecision, HumanApproval, AuditEvent, PayPalOperation, DecisionReceipt**, plus **WebhookEvent**. UUIDs identify domain records; external event IDs retain their original value. Transactions use an explicit status enum, not booleans.

```text
prisma/schema.prisma        Domain relationships and payment constraints
prisma/migrations/          Reproducible PostgreSQL migration
prisma/seed.ts              Repeatable catalog, operator and demo history
src/app/                   Next.js pages and individual API routes
src/components/            Console, mandate builder, AG Grid, receipts, lab
src/lib/ai/                Draft policy compiler and catalog-only AI agent
src/lib/domain/            Shared Zod schemas, state machine and demo fixtures
src/lib/policy/            Pure deterministic evaluatePurchase
src/lib/risk/              Transparent risk scoring
src/lib/paypal/            OAuth, REST adapters, idempotency, webhook verification
src/lib/services/          Locked financial workflows, approvals, receipts and audit
src/lib/security/          Auth, rate-limit abstraction, untrusted-content detection
tests/                     Unit, API and real-PostgreSQL integration tests
e2e/                       Complete Playwright browser scenarios
scripts/local-db.mjs       Persistent local PostgreSQL launcher
```

Stack: Next.js App Router, strict TypeScript, React, Tailwind CSS, local shadcn/ui primitives, PostgreSQL, Prisma, Zod, OpenAI Node SDK, PayPal REST APIs, AG Grid Community, Vitest, Playwright, ESLint and Prettier.

## Validation

```sh
npm run db:generate
npm run db:migrate
npm run db:seed
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run format:check
```

To exercise the production build in Chromium from PowerShell:

```powershell
$env:E2E_PRODUCTION = "true"
$env:E2E_PORT = "3002" # Keep your normal Sandbox server running on port 3000.
npm run test:e2e -- --headed
Remove-Item Env:E2E_PRODUCTION
Remove-Item Env:E2E_PORT
```

With the local server running using your Sandbox credentials, `npm run paypal:check` creates a real $537 AUTHORIZE order through the application APIs, checks repeated order creation returns the same ID, and verifies a blocked injection cart never creates a payment operation. This creates fresh validation mandates and transactions. It prints the receipt URL and saves non-secret results to ignored `.data/sandbox-validation.json`. Buyer approval and capture remain separate explicit actions in the receipt UI. The command requires the explicit local demo workspace and does not enter buyer credentials or approve purchases on your behalf.

The automatic spending guard recognizes explicit English thresholds such as “Automatically purchase up to $600” and “Purchases up to $600 can happen automatically.” It takes the smallest recognized limit; unrecognized automatic spending wording requires clarification rather than granting broader permission. A sentence saying a purchase requires approval grants no automatic spending.

See [the local AI report](docs/local-ai-report.md) and [the engineering validation report](docs/engineering-report.md) for results, remaining setup and the demo procedure.

`npm test` uses the configured PostgreSQL database for integration cases and removes its own successful fixtures. Without `DATABASE_URL`, integration cases are explicitly skipped; a fully validated run needs the database. Use a dedicated development/test database. External credentials are cleared by the unit/integration test configuration. Only the payment API boundary is substituted in financial integration tests; policy, locking, approval, audit and Prisma logic are real.

Playwright exercises mandate creation/activation, agent evaluation, simulated capture and receipt, injection blocking, human approval and responsive layout. It refuses an existing server with real payment mode. CI provisions PostgreSQL and runs checks, build and Chromium scenarios. The Rollup dependency resolves to the official WASM distribution for environments that block native Node extensions.

## Screenshots

These screenshots show the current local application with real persisted data. The Sandbox receipt shows the verified $537 capture after buyer approval, authorization and the final policy check. Order `22G673728L3306907`, authorization `5S481085LL587635D`, capture `2US03005SE554815A`.

![Operations dashboard](docs/screenshots/dashboard.png)

[Landing](docs/screenshots/landing.png) · [Attack Lab](docs/screenshots/attack-lab.png) · [Sandbox receipt](docs/screenshots/sandbox-receipt.png) · [Local Ollama policy](docs/screenshots/local-ai-policy.png) · [Mobile](docs/screenshots/mobile.png)

## Exact three-minute demo

| Time      | Action and narration                                                                                                                                                                                                             |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:20 | Landing: “The trust layer between AI agents and your money.” Point to AI → deterministic controls → PayPal.                                                                                                                      |
| 0:20–0:50 | Create mandate. Paste: “Buy 3 new 27-inch 1440p monitors under $700. Automatically purchase up to $600.” Generate, review budget/specifications, explicitly confirm and activate.                                                |
| 0:50–1:15 | Open shopping agent and evaluate. Show Monitor Alpha, 3 × $179 = $537, ALLOW, and every recorded check.                                                                                                                          |
| 1:15–1:45 | Execute simulated checkout, or create Sandbox order and approve with a prepared Personal buyer. Continue authorization/capture. Show mode, final check and payment references. Never describe a simulation as a Sandbox payment. |
| 1:45–2:15 | Attack Lab E. Show the malicious SYSTEM MESSAGE, $812 cart, extra warranty/cables. Confirm the lab template, run, and show BLOCKED / PAYPAL NOT EXECUTED.                                                                        |
| 2:15–2:40 | Lab D: $675 exceeds autonomous authority but fits the hard budget. Approve or reject. Show the bound human-decision audit event.                                                                                                 |
| 2:40–3:00 | Dashboard: filter BLOCK, open the injection receipt, show original intent, violations and audit timeline. Close: “The AI recommends. The policy engine authorizes. PayPal executes.”                                             |

Prepare Sandbox buyer credentials and its login ahead of time; external approval latency may extend the live demo. The simulation sequence requires no external service.

## Limits and next improvements

This is a substantial hackathon MVP, not certification for production money movement. Real local Ollama inference and PayPal Sandbox creation, authorization and capture were verified. OpenAI is optional and unnecessary for the demo. Signed webhook delivery and remote operator authentication require their remaining configuration.

The catalog is controlled; merchant claims are not independently attested. One Sandbox merchant receives all payments. Only USD, one operator, one selected catalog product plus explicit adversarial fixtures, and one capture per authorization are supported. There is no tax/shipping engine, fulfillment, refund initiation, subscription support or seller onboarding. Abandoned PayPal orders retain reservations; automatic expiration/reconciliation is a next step. An ambiguous network/DB failure beyond the automatic retry window needs operational reconciliation. Advisory locks are held during short, timeout-bounded network calls; production should use durable workers and an outbox/reconciliation service. Rate limiting is per process. Audit logs are immutable through the application, not cryptographically tamper-proof against a database administrator. The UI has a polished light workspace and dark navigation; a global theme switch is not included.

Best next improvements: durable payment reconciliation and expiring reservations; full identity/RBAC; Redis-backed rate limits; authenticated merchant quote attestations and third-party catalog adapter; formal AI compiler evaluations; independently reviewed payment/security architecture; deployment observability and backup/restore drills.

The single-operator login currently shares a five-attempt-per-minute quota. Anonymous requests can temporarily exhaust that quota and prevent new sessions; existing sessions are unaffected. Before public deployment, use client identity supplied by a trusted ingress and distributed rate limits. Arbitrary forwarded IP headers are not reliable identity.

MIT licensed. See [LICENSE](LICENSE).
