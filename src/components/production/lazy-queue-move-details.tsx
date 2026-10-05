"use client";

import { useState, type ReactNode } from "react";

/** Renders heavy move-form children only after the user opens the details block. */
export function LazyQueueMoveDetails({
  summary,
  children,
  className,
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <details
      className={className}
      open={open}
      onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer font-medium text-ink">{summary}</summary>
      {open ? children : null}
    </details>
  );
}
