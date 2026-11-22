import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { SafetyBanner } from "@/components/nova/SafetyBanner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NOVA AI — Command Center" },
      {
        name: "description",
        content:
          "Operations and read-only trading intelligence console. Live trading is off by design.",
      },
      { property: "og:title", content: "NOVA AI — Command Center" },
      {
        property: "og:description",
        content: "Operations and read-only trading intelligence console.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen flex-col">
      <SafetyBanner />
      <div className="mx-auto flex max-w-3xl flex-1 flex-col justify-center px-6 py-16">
        <div className="terminal-label">// system operations · trading intelligence</div>
        <h1 className="mt-3 font-mono text-5xl font-bold tracking-[0.15em] text-primary md:text-7xl">
          NOVA AI
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">
          A command center for monitoring services, a read-only MT5 bridge and risk policy. Nothing
          here places orders or moves funds.
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild size="lg">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/dashboard">Open console</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}