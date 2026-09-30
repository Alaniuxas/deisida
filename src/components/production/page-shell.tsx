import Link from "next/link";
import { cn } from "@/lib/utils";

interface PageShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
}

export function PageShell({
  title,
  subtitle,
  children,
  className,
  wide = false,
}: PageShellProps) {
  return (
    <div className="min-h-full bg-background">
      <header className="border-b border-stone-line bg-paper">
        <div
          className={cn(
            "mx-auto flex flex-col gap-1 px-4 py-4 sm:px-6",
            wide ? "max-w-6xl" : "max-w-3xl",
          )}
        >
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/"
              className="text-sm font-semibold tracking-tight text-deisida"
            >
              Deisida
            </Link>
            <nav className="flex gap-3 text-sm text-muted-foreground">
              <Link href="/cechas" className="hover:text-foreground">
                Cechas
              </Link>
              <Link href="/eile" className="hover:text-foreground">
                Eilė
              </Link>
              <Link href="/admin/konvejeriai" className="hover:text-foreground">
                Admin
              </Link>
            </nav>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="text-base text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </header>
      <main
        className={cn(
          "mx-auto px-4 py-6 sm:px-6",
          wide ? "max-w-6xl" : "max-w-3xl",
          className,
        )}
      >
        {children}
      </main>
    </div>
  );
}
