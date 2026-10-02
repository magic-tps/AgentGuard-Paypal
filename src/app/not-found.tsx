import Link from "next/link";
import { Logo } from "@/components/shared";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <main className="not-found" id="main-content">
      <Logo />
      <span className="eyebrow">404 / OUTSIDE THE BOUNDARY</span>
      <h1>This page is out of scope.</h1>
      <p>Return to your workspace to find your mandates and transaction receipts.</p>
      <Button asChild>
        <Link href="/dashboard">Back to overview</Link>
      </Button>
    </main>
  );
}
