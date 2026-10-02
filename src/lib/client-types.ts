import type {
  Evaluation,
  Purchase,
  SpendingPolicy,
  Decision,
  RiskLevel,
} from "@/lib/domain/schemas";
export type Session = {
  userId: string;
  name: string;
  mode: "SIMULATED" | "PAYPAL_SANDBOX";
  demoMode: boolean;
  aiMode: "OLLAMA" | "DETERMINISTIC" | "OPENAI";
  localDemo: boolean;
};
export type Audit = {
  id: string;
  type: string;
  actor: string;
  metadata: unknown;
  createdAt: string;
};
export type Version = {
  id: string;
  version: number;
  policy: SpendingPolicy;
  model: string;
  confirmedAt: string | null;
  originalIntent: string;
  createdAt: string;
};
export type Mandate = {
  id: string;
  name: string;
  originalIntent: string;
  status: "DRAFT" | "ACTIVE" | "INACTIVE";
  version: number;
  createdAt: string;
  versions: Version[];
  audits: Audit[];
};
export type Product = {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  category: string;
  condition: string;
  specifications: { sizeInches?: number; resolutionWidth?: number; resolutionHeight?: number };
  merchant: { id: string; name: string; trusted: boolean };
  riskFlags: string[];
};
export type Transaction = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  decision: Decision;
  riskLevel: RiskLevel;
  riskScore: number;
  mode: "SIMULATED" | "PAYPAL_SANDBOX";
  scenario: string | null;
  createdAt: string;
  updatedAt: string;
  paypalOrderId: string | null;
  paypalAuthorizationId: string | null;
  paypalCaptureId: string | null;
  paypalStatus: string | null;
  approvalUrl: string | null;
  lastError: string | null;
  quote: Purchase;
  currentQuote: Purchase;
  quoteHash: string;
  mandate: { id: string; name: string; originalIntent: string; status: string; version: number };
  policyVersion: Version;
  policy: SpendingPolicy;
  agent: { id: string; name: string };
  merchant: { id: string; name: string };
  purchaseRequest: { source: string; explanation: string };
  evaluation: Evaluation;
  decisions: { id: string; phase: string; result: Evaluation; createdAt: string }[];
  approvals: {
    id: string;
    status: string;
    amount: number;
    currency: string;
    quoteHash: string;
    policyVersionId: string;
    approverId: string | null;
    decidedAt: string | null;
    createdAt: string;
  }[];
  audits: Audit[];
  operations: { id: string; operation: string; requestId: string; mode: string; status: string }[];
  receipt: { id: string; snapshot: unknown; createdAt: string; updatedAt: string } | null;
};
export type Overview = {
  transactions: Transaction[];
  stats: {
    autonomousSpend: number;
    blockedAttempts: number;
    humanApprovals: number;
    protectedAgents: number;
    policyViolations: number;
  };
  scope: string;
};
