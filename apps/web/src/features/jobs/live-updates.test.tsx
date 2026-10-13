import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useJobLiveUpdates } from "./live-updates";

/** Minimal stand-in for the browser's EventSource (jsdom doesn't have one). */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  private listeners = new Map<string, ((event: MessageEvent) => void)[]>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  emit(type: string, data: unknown) {
    const event = new MessageEvent(type, { data: JSON.stringify(data) });
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }

  close() {
    this.closed = true;
  }
}

function Probe() {
  return <span>{useJobLiveUpdates()}</span>;
}

function renderProbe() {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const view = render(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>,
  );
  return { invalidate, view, source: FakeEventSource.instances.at(-1)! };
}

const keysOf = (invalidate: { mock: { calls: unknown[][] } }) =>
  invalidate.mock.calls.map(
    ([filters]) => (filters as { queryKey: unknown[] }).queryKey,
  );

describe("useJobLiveUpdates", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("subscribes to the job event stream and reports when it's live", () => {
    const { source } = renderProbe();

    expect(source.url).toBe("/api/events");
    expect(screen.getByText("connecting")).toBeInTheDocument();
    act(() => source.onopen?.());
    expect(screen.getByText("live")).toBeInTheDocument();
    act(() => source.onerror?.());
    expect(screen.getByText("reconnecting")).toBeInTheDocument();
  });

  it("batches a burst of changes into one refetch of the affected data", () => {
    const { source, invalidate } = renderProbe();

    act(() => {
      source.emit("job", { kind: "updated", id: "a" });
      source.emit("job", { kind: "updated", id: "a" });
      source.emit("job", { kind: "created", id: "b" });
    });
    expect(invalidate).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(300));

    expect(keysOf(invalidate)).toEqual([
      ["jobs", "list"],
      ["jobs", "map"],
      ["jobs", "stats"],
      ["jobs", "detail", "a"],
      ["jobs", "history", "a"],
      ["jobs", "detail", "b"],
      ["jobs", "history", "b"],
    ]);
  });

  it("refetches everything after the server lost track of changes", () => {
    const { source, invalidate } = renderProbe();

    act(() => {
      source.emit("job", { kind: "resync" });
      vi.advanceTimersByTime(300);
    });

    expect(keysOf(invalidate)).toEqual([["jobs"]]);
  });

  it("closes the stream on unmount", () => {
    const { source, view } = renderProbe();

    view.unmount();

    expect(source.closed).toBe(true);
  });
});
