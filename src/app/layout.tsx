import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "AgentGuard — The trust layer for autonomous commerce",
    template: "%s | AgentGuard",
  },
  description:
    "AI agents can spend money. AgentGuard makes sure they spend it exactly as humans intended.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
