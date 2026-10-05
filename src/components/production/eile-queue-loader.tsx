"use client";

import { useEffect, useState } from "react";
import { LoadingState } from "@/components/production/async-state";
import { EileQueueView } from "@/components/production/eile-queue-view";
import type { DowntimeRow } from "@/components/production/machine-downtime-form";
import {
  readEileFlashNotice,
  stripEileFlashSearchParams,
  type EileFlashVariant,
} from "@/lib/eile-flash-notice";
import { fetchQueue } from "@/lib/production-api";
import type { ProductionApiError, QueueResponse } from "@/lib/production-types";

interface EileQueueLoaderProps {
  notice?: string | null;
  noticeVariant?: EileFlashVariant;
  selectedCode?: string;
  confirmed?: string;
  jobsCreated?: string;
  canEdit?: boolean;
  isAdmin?: boolean;
  downtimes?: DowntimeRow[];
}

export function EileQueueLoader({
  notice: serverNotice,
  noticeVariant: serverNoticeVariant = "success",
  ...props
}: EileQueueLoaderProps) {
  const [data, setData] = useState<QueueResponse | null>(null);
  const [error, setError] = useState<ProductionApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [bannerNotice, setBannerNotice] = useState<string | null>(
    serverNotice ?? null,
  );
  const [bannerVariant, setBannerVariant] =
    useState<EileFlashVariant>(serverNoticeVariant);

  useEffect(() => {
    const flash = readEileFlashNotice();
    if (flash) {
      setBannerNotice(flash.message);
      setBannerVariant(flash.variant);
      return;
    }
    if (serverNotice) {
      setBannerNotice(serverNotice);
      setBannerVariant(serverNoticeVariant);
    }
  }, [serverNotice, serverNoticeVariant]);

  useEffect(() => {
    stripEileFlashSearchParams();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetchQueue(controller.signal)
      .then((queue) => {
        if (controller.signal.aborted) return;
        setData(queue);
        setError(null);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setData(null);
        setError(err as ProductionApiError);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <div className="px-6 py-10 lg:px-10">
        <LoadingState label="Kraunama gamybinė eilė…" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="px-6 py-10 lg:px-10">
        <p className="text-sm text-destructive">
          {error?.message ?? "Nepavyko įkelti eilės."}
        </p>
      </div>
    );
  }

  return (
    <EileQueueView
      data={data}
      notice={bannerNotice}
      noticeVariant={bannerVariant}
      {...props}
    />
  );
}
