"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/auth";

interface AppNavProps {
  user: {
    name: string;
    email: string;
    role: UserRole;
  };
}

const linksForRole: Record<UserRole, { href: string; label: string }[]> = {
  admin: [
    { href: "/plyteliu-baras", label: "Plytelių baras" },
    { href: "/pasiulymai", label: "Pasiūlymai" },
    { href: "/eile", label: "Eilė" },
    { href: "/cechas", label: "Cechas" },
    { href: "/admin/statistika", label: "Statistika" },
    { href: "/admin/konvejeriai", label: "Konvejeriai" },
  ],
  pardavimai: [
    { href: "/plyteliu-baras", label: "Plytelių baras" },
    { href: "/pasiulymai", label: "Pasiūlymai" },
    { href: "/eile", label: "Eilė" },
  ],
  cechas: [{ href: "/cechas", label: "Cechas" }],
};

const homeForRole: Record<UserRole, string> = {
  admin: "/plyteliu-baras",
  pardavimai: "/plyteliu-baras",
  cechas: "/cechas",
};

/** Sunkūs puslapiai — be prefetch, kad nebekrautų plano fone. */
const noPrefetchHrefs = new Set([
  "/eile",
  "/admin/konvejeriai",
  "/admin/statistika",
  "/pasiulymai",
]);

export function AppNav({ user }: AppNavProps) {
  const pathname = usePathname();
  const links = linksForRole[user.role];
  const homeHref = homeForRole[user.role];

  return (
    <header className="sticky top-0 z-40 border-b border-stone-line bg-white">
      <div className="flex flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-10">
        <div className="flex items-center gap-8">
          <Link href={homeHref} className="block">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-deisida">
              Deisida
            </p>
            <p className="text-sm font-semibold text-deisida-muted">Plytelių baras</p>
          </Link>
          <nav className="flex flex-wrap gap-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                prefetch={noPrefetchHrefs.has(link.href) ? false : undefined}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  pathname.startsWith(link.href)
                    ? "bg-deisida text-deisida-foreground"
                    : "text-deisida-muted hover:bg-[#f3f3f0]",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{user.name}</span>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="rounded-md border border-stone-line px-3 py-1.5 text-sm hover:bg-[#f3f3f0]"
            >
              Atsijungti
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
