"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { describeError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { geocodeQueries, type GeocodeResult } from "../geocoding";

const MIN_LENGTH = 3;

/**
 * Address search (ARIA combobox): suggestions as you type, biased towards where the map is.
 * Choosing one moves the pin and fills the address.
 */
export function AddressSearch({
  near,
  onSelect,
}: {
  near: { latitude: number; longitude: number } | null;
  onSelect: (result: GeocodeResult) => void;
}) {
  const id = useId();
  const listId = `${id}-results`;
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  // Debounced: a request per pause in typing, not per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(text.trim());
      setActive(-1);
    }, 350);
    return () => clearTimeout(timer);
  }, [text]);

  const enabled = open && query.length >= MIN_LENGTH;
  const search = useQuery({ ...geocodeQueries.search(query, near), enabled });
  const results = enabled ? (search.data ?? []) : [];
  const expanded = open && enabled;

  const choose = (result: GeocodeResult) => {
    onSelect(result);
    setText(result.label);
    setQuery(result.label);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && results.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp" && results.length > 0) {
      event.preventDefault();
      setActive((index) => (index <= 0 ? results.length - 1 : index - 1));
    } else if (
      event.key === "Enter" &&
      expanded &&
      active >= 0 &&
      results[active]
    ) {
      // Choosing a suggestion must not submit the job form.
      event.preventDefault();
      choose(results[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        role="combobox"
        aria-label="Search for an address or place"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          expanded && active >= 0 ? `${listId}-${active}` : undefined
        }
        placeholder="Search for an address or place"
        autoComplete="off"
        className="pl-8"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {search.isFetching && enabled && (
        <Loader2
          className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
          aria-hidden
        />
      )}

      {expanded && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border bg-popover text-sm shadow-md">
          <ul id={listId} role="listbox" aria-label="Matching places">
            {results.map((result, index) => (
              <li
                key={`${result.label}-${result.latitude}-${result.longitude}`}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                // mousedown, so the choice lands before the input's blur closes the list.
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(result);
                }}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  "cursor-pointer px-3 py-2",
                  index === active && "bg-accent",
                )}
              >
                {result.label}
              </li>
            ))}
          </ul>
          {search.isPending && (
            <p className="px-3 py-2 text-muted-foreground">Searching…</p>
          )}
          {search.error && !search.isFetching && (
            <p role="alert" className="px-3 py-2 text-destructive">
              {describeError(search.error).detail}
            </p>
          )}
          {search.isSuccess && results.length === 0 && (
            <p className="px-3 py-2 text-muted-foreground">
              No matching places. Try a street or suburb.
            </p>
          )}
          <p className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
            Search by Photon · © OpenStreetMap contributors
          </p>
        </div>
      )}
    </div>
  );
}
