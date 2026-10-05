"use client";

import { useEffect } from "react";

/** Soft-nav tarp konvejerių kitaip palieka scroll apačioje — visada į viršų. */
export function ScrollLaneIntoView({ laneCode }: { laneCode: string }) {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [laneCode]);
  return null;
}
