"use client";
import { ErrorState } from "@/components/shared";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page" id="main-content">
      <ErrorState
        message="The page could not be loaded. Your saved policies and transactions are preserved."
        retry={reset}
      />
    </main>
  );
}
