"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { jobKeys } from "./api";

export type LiveState = "connecting" | "live" | "reconnecting" | "unsupported";

type JobChange = { kind: string; id?: string | null };

/** Changes often arrive in bursts (e.g. a reseed), so refetches are batched. */
const FLUSH_DELAY_MS = 250;

/**
 * Subscribes to `/api/events` and refreshes whatever another user's change affects: lists, map,
 * counts and the changed jobs' details. One stream per tab; EventSource reconnects on its own.
 */
export function useJobLiveUpdates(): LiveState {
  const queryClient = useQueryClient();
  const [state, setState] = useState<LiveState>(() =>
    typeof window !== "undefined" && typeof EventSource === "undefined"
      ? "unsupported"
      : "connecting",
  );

  useEffect(() => {
    if (typeof EventSource === "undefined") {
      return;
    }

    const source = new EventSource("/api/events");
    const changedIds = new Set<string>();
    let refetchEverything = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const flush = () => {
      timer = undefined;
      if (refetchEverything) {
        refetchEverything = false;
        changedIds.clear();
        void queryClient.invalidateQueries({ queryKey: jobKeys.all });
        return;
      }
      invalidateChanges(queryClient, [...changedIds]);
      changedIds.clear();
    };

    source.addEventListener("job", (event) => {
      const change = parse((event as MessageEvent<string>).data);
      if (!change) {
        return;
      }
      if (change.kind === "resync") {
        refetchEverything = true;
      } else if (change.id) {
        changedIds.add(change.id);
      }
      timer ??= setTimeout(flush, FLUSH_DELAY_MS);
    });
    source.addEventListener("ping", () => setState("live"));
    source.onopen = () => setState("live");
    source.onerror = () => setState("reconnecting");

    return () => {
      source.close();
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [queryClient]);

  return state;
}

function invalidateChanges(queryClient: QueryClient, ids: string[]) {
  for (const kind of ["list", "map", "stats"] as const) {
    void queryClient.invalidateQueries({ queryKey: ["jobs", kind] });
  }
  for (const id of ids) {
    void queryClient.invalidateQueries({ queryKey: jobKeys.detail(id) });
    void queryClient.invalidateQueries({ queryKey: jobKeys.history(id) });
  }
}

function parse(data: string): JobChange | null {
  try {
    const value: unknown = JSON.parse(data);
    return typeof value === "object" && value !== null && "kind" in value
      ? (value as JobChange)
      : null;
  } catch {
    return null;
  }
}
