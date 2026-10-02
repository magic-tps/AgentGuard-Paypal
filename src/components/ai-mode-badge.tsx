"use client";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/components/app-shell";

export function AiModeBadge() {
  const session = useSession();
  const text =
    session?.aiMode === "OLLAMA"
      ? "LOCAL — OLLAMA"
      : session?.aiMode === "OPENAI"
        ? "OPENAI (OPTIONAL)"
        : session
          ? "DETERMINISTIC FALLBACK"
          : "CONNECTING";
  return (
    <Badge tone={session?.aiMode === "DETERMINISTIC" ? "neutral" : "teal"}>
      <span aria-label="AI ENGINE">{text}</span>
    </Badge>
  );
}
