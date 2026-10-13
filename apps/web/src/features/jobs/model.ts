import type { components } from "@/lib/api/schema";

type Schemas = components["schemas"];

export type Job = Schemas["JobResponse"];
export type JobStatus = NonNullable<Schemas["JobStatus"]>;
export type JobPriority = NonNullable<Schemas["JobPriority"]>;
export type JobSort = NonNullable<Schemas["JobSort"]>;
export type JobPage = Schemas["JobPage"];
export type JobMapPoint = Schemas["JobMapPoint"];
export type AllowedTransition = Schemas["AllowedTransition"];
export type StatusChange = Schemas["StatusChangeResponse"];
export type CreateJobRequest = Schemas["CreateJobRequest"];
export type UpdateJobRequest = Schemas["UpdateJobRequest"];
export type TransitionRequest = Schemas["TransitionRequest"];

/** Display metadata. Colours are hex so the map layers can use them too. */
export const STATUS_META = {
  Draft: {
    label: "Draft",
    color: "#64748b",
    badge: "bg-slate-100 text-slate-700 ring-slate-300/70",
  },
  Scheduled: {
    label: "Scheduled",
    color: "#2563eb",
    badge: "bg-blue-50 text-blue-700 ring-blue-200",
  },
  InProgress: {
    label: "In progress",
    color: "#d97706",
    badge: "bg-amber-50 text-amber-800 ring-amber-200",
  },
  OnHold: {
    label: "On hold",
    color: "#9333ea",
    badge: "bg-purple-50 text-purple-700 ring-purple-200",
  },
  Completed: {
    label: "Completed",
    color: "#16a34a",
    badge: "bg-green-50 text-green-700 ring-green-200",
  },
  Cancelled: {
    label: "Cancelled",
    color: "#dc2626",
    badge: "bg-red-50 text-red-700 ring-red-200",
  },
} as const satisfies Record<
  JobStatus,
  { label: string; color: string; badge: string }
>;

export const JOB_STATUSES = Object.keys(STATUS_META) as JobStatus[];

export const PRIORITY_META = {
  Low: { label: "Low" },
  Normal: { label: "Normal" },
  High: { label: "High" },
  Urgent: { label: "Urgent" },
} as const satisfies Record<JobPriority, { label: string }>;

export const JOB_PRIORITIES = Object.keys(PRIORITY_META) as JobPriority[];

export const SORT_LABELS = {
  Updated: "Recently updated",
  Scheduled: "Scheduled date",
  Priority: "Priority",
  Distance: "Distance",
} as const satisfies Record<JobSort, string>;

export const JOB_SORTS = Object.keys(SORT_LABELS) as JobSort[];

/** Verb for the button that moves a job from one status to another. */
export function transitionLabel(from: JobStatus, to: JobStatus): string {
  switch (to) {
    case "Scheduled":
      return from === "Draft" ? "Schedule" : "Reschedule";
    case "InProgress":
      return from === "OnHold" ? "Resume work" : "Start work";
    case "OnHold":
      return "Put on hold";
    case "Completed":
      return "Mark complete";
    case "Cancelled":
      return "Cancel job";
    default:
      return STATUS_META[to].label;
  }
}

/** Forward progress first, then holds, then cancellation. */
const TRANSITION_ORDER: JobStatus[] = [
  "InProgress",
  "Completed",
  "Scheduled",
  "OnHold",
  "Cancelled",
];

export function orderTransitions(
  transitions: AllowedTransition[],
): AllowedTransition[] {
  return [...transitions].sort(
    (a, b) => TRANSITION_ORDER.indexOf(a.to) - TRANSITION_ORDER.indexOf(b.to),
  );
}

export const DEFAULT_CENTER = { latitude: -36.8485, longitude: 174.7633 };
