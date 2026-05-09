import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { Leaf } from "lucide-react";

export function SiteHeader() {
  const { pathname } = useLocation();
  const onAuth = pathname.startsWith("/login") || pathname.startsWith("/signup");

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary shadow-soft">
            <Leaf className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold tracking-tight">HomeoCare</span>
        </Link>
        {!onAuth && (
          <nav className="flex items-center gap-2">
            <Link
              to="/login"
              className="hidden rounded-full px-4 py-2 text-sm font-medium text-foreground transition-smooth hover:bg-muted sm:inline-flex"
            >
              Sign in
            </Link>
            <Link
              to="/signup"
              className="inline-flex items-center justify-center rounded-full bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft transition-smooth hover:shadow-elevated"
            >
              Get started
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}

export function SiteLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
