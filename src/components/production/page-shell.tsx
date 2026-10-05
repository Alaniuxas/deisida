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
