"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type ICellRendererParams,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/shared";
import type { Transaction } from "@/lib/client-types";
import { date, money } from "@/lib/utils";
ModuleRegistry.registerModules([AllCommunityModule]);
const theme = themeQuartz.withParams({
  accentColor: "#456238",
  backgroundColor: "#ffffff",
  foregroundColor: "#26352b",
  borderColor: "#e4e8df",
  headerBackgroundColor: "#f6f7f3",
  headerTextColor: "#61705f",
  oddRowBackgroundColor: "#ffffff",
  fontFamily: "Arial, sans-serif",
  fontSize: 12,
  rowHeight: 57,
  headerHeight: 43,
  browserColorScheme: "light",
  wrapperBorderRadius: 0,
});
const filters = [
  "All transactions",
  "ALLOW",
  "BLOCK",
  "REQUIRE_APPROVAL",
  "CAPTURED",
  "VOIDED",
  "Prompt Injection",
  "Budget Violation",
  "Unauthorized Item",
];
export function TransactionGrid({
  transactions,
  compact = false,
}: {
  transactions: Transaction[];
  compact?: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All transactions");
  const [risk, setRisk] = useState("");
  const [since, setSince] = useState("");
  const rows = useMemo(
    () =>
      transactions.filter((t) => {
        const matches =
          status === "All transactions" ||
          t.decision === status ||
          t.status === status ||
          (status === "Prompt Injection" &&
            (t.scenario === "injection" ||
              t.evaluation.violations.includes("SUSPICIOUS_CONTENT"))) ||
          (status === "Budget Violation" &&
            t.evaluation.violations.includes("MAX_TOTAL_EXCEEDED")) ||
          (status === "Unauthorized Item" && t.evaluation.violations.includes("UNAUTHORIZED_ITEM"));
        return (
          matches &&
          (!risk || t.riskLevel === risk) &&
          (!since || new Date(t.createdAt) >= new Date(`${since}T00:00:00`))
        );
      }),
    [transactions, status, risk, since],
  );
  const columns = useMemo<ColDef<Transaction>[]>(
    () => [
      {
        field: "createdAt",
        headerName: "TIME",
        width: 142,
        valueFormatter: (p) => (p.value ? date(p.value) : ""),
      },
      {
        field: "id",
        headerName: "TRANSACTION",
        minWidth: 130,
        flex: 1,
        cellRenderer: (p: ICellRendererParams<Transaction>) =>
          p.data ? (
            <a
              className="grid-id"
              href={`/transactions/${p.data.id}`}
              onClick={(e) => e.stopPropagation()}
            >
              TX-{p.data.id.slice(0, 8).toUpperCase()}
            </a>
          ) : null,
      },
      { field: "agent.name", headerName: "AGENT", width: 150 },
      { field: "merchant.name", headerName: "MERCHANT", width: 145 },
      {
        field: "amount",
        headerName: "AMOUNT",
        width: 115,
        type: "numericColumn",
        valueFormatter: (p) => money(p.value ?? 0, p.data?.currency),
      },
      { field: "currency", headerName: "CCY", width: 78 },
      {
        field: "riskLevel",
        headerName: "RISK",
        width: 105,
        cellRenderer: (p: ICellRendererParams<Transaction>) => (
          <StatusBadge value={p.value || "LOW"} />
        ),
      },
      {
        field: "policyVersion.version",
        headerName: "POLICY",
        width: 95,
        valueFormatter: (p) => `v${p.value ?? 1}`,
      },
      {
        field: "decision",
        headerName: "DECISION",
        width: 162,
        cellRenderer: (p: ICellRendererParams<Transaction>) => (
          <StatusBadge value={p.value || "DRAFT"} />
        ),
      },
      {
        field: "status",
        headerName: "PAYMENT STATUS",
        width: 192,
        cellRenderer: (p: ICellRendererParams<Transaction>) => (
          <StatusBadge value={p.data?.paypalStatus || p.value || "DRAFT"} mode={p.data?.mode} />
        ),
      },
    ],
    [],
  );
  return (
    <div className="grid-panel">
      <div className="grid-toolbar">
        <label className="search-input">
          <Search size={16} />
          <Input
            placeholder="Search transactions…"
            aria-label="Search transactions"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="grid-filter-controls">
          <SlidersHorizontal size={15} />
          <select
            aria-label="Filter by decision or violation"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {filters.map((f) => (
              <option key={f} value={f}>
                {f.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by risk"
            value={risk}
            onChange={(e) => setRisk(e.target.value)}
          >
            <option value="">All risk levels</option>
            {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          {!compact && (
            <Input
              type="date"
              aria-label="Transactions from date"
              value={since}
              onChange={(e) => setSince(e.target.value)}
            />
          )}
        </div>
      </div>
      <div className="transaction-grid" style={{ height: compact ? 400 : 610 }}>
        <AgGridReact<Transaction>
          theme={theme}
          rowData={rows}
          columnDefs={columns}
          defaultColDef={{ sortable: true, filter: true, resizable: true }}
          quickFilterText={search}
          pagination
          paginationPageSize={compact ? 5 : 10}
          paginationPageSizeSelector={[5, 10, 25, 50]}
          rowSelection={{ mode: "multiRow", enableClickSelection: false }}
          onRowClicked={(e) => {
            if (e.data) router.push(`/transactions/${e.data.id}`);
          }}
          getRowId={(p) => p.data.id}
          overlayNoRowsTemplate="<span>No transactions match these filters.</span>"
        />
      </div>
      <div className="grid-footnote">
        <span>{rows.length} recorded transactions</span>
        <span>
          Click a row to inspect its decision receipt <span aria-hidden>↗</span>
        </span>
      </div>
    </div>
  );
}
