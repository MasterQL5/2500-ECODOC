import { Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { gameStateQuery } from "@/lib/queries";
import { useSession } from "@/hooks/useSession";
import { useNumberDisplay } from "@/hooks/useNumberDisplay";
import { GmQuickLogin } from "@/components/GmQuickLogin";

const NAV = [
  { to: "/", label: "Overview" },
  { to: "/nations", label: "Nations" },
  { to: "/market", label: "Market" },
  { to: "/exchange", label: "Exchange" },
  { to: "/map", label: "Atlas" },
  { to: "/gazette", label: "Gazette" },
  { to: "/archive", label: "Archive" },
] as const;

export function BureauShell({ children }: { children: React.ReactNode }) {
  const { data: state } = useSuspenseQuery(gameStateQuery);
  const { isGm, user } = useSession();
  const { mode, toggle } = useNumberDisplay();

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <Link to="/" className="flex items-baseline gap-3">
            <span className="font-display text-lg font-bold uppercase tracking-[0.2em] text-primary">
              {state.bureau_name}
            </span>
            <span className="rule-label hidden sm:inline">World Commodity Exchange</span>
          </Link>
          <nav className="flex flex-1 flex-wrap items-center gap-1">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded px-2.5 py-1 text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                activeOptions={{ exact: item.to === "/" }}
                activeProps={{ className: "bg-secondary text-primary" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <button
              onClick={toggle}
              title={
                mode === "compact"
                  ? "Numbers: Short (5T) — click for full figures"
                  : "Numbers: Full — click for short figures (5T)"
              }
              aria-label="Toggle between short and full numbers"
              className={`relative flex h-7 w-4 items-center justify-center rounded-full border transition-colors ${
                mode === "full" ? "border-primary bg-primary/20" : "border-border bg-secondary"
              }`}
            >
              <span
                className={`absolute h-3 w-3 rounded-full bg-current text-[8px] font-bold leading-none transition-all ${
                  mode === "full" ? "top-1 text-primary" : "bottom-1 text-muted-foreground"
                } flex items-center justify-center`}
              >
                N
              </span>
            </button>
            <div className="text-right">
              <div className="rule-label">Fiscal year</div>
              <div className="font-display text-xl font-bold leading-none text-primary tabular">
                {state.current_year}
              </div>
            </div>
            <Link
              to={isGm ? "/gm" : "/auth"}
              className="rounded border border-primary/50 px-3 py-1.5 text-xs uppercase tracking-widest text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
            >
              {isGm ? "GM Panel" : user ? "Account" : "GM Login"}
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl overflow-x-hidden px-4 py-8">{children}</main>
      <GmQuickLogin />
      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        {state.bureau_name} · All figures denominated in {state.currency_code} · Values change only
        by game-master ruling or annual revaluation.
      </footer>
    </div>
  );
}
