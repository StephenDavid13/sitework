import type { Job, JobPage, StatusChange } from "@/features/jobs/model";

export function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "0199a000-0000-7000-8000-000000000001",
    reference: "JOB-1001",
    title: "Replace hot water cylinder",
    description: "Leaking from the base.",
    status: "Scheduled",
    priority: "High",
    location: { latitude: -36.8485, longitude: 174.7633 },
    siteName: "Kingsland site",
    address: "12 Kauri Street, Kingsland",
    assignee: "Tama Wiremu",
    scheduledFor: "2026-10-20T20:00:00Z",
    completedAt: null,
    createdAt: "2026-10-10T01:00:00Z",
    updatedAt: "2026-10-12T01:00:00Z",
    version: 100,
    canEdit: true,
    canDelete: false,
    allowedTransitions: [
      { to: "InProgress", requiresNote: false, requiresSchedule: false },
      { to: "OnHold", requiresNote: true, requiresSchedule: false },
      { to: "Cancelled", requiresNote: true, requiresSchedule: false },
    ],
    ...overrides,
  };
}

export function makePage(
  items: Job[],
  overrides: Partial<JobPage> = {},
): JobPage {
  return { items, page: 1, pageSize: 20, total: items.length, ...overrides };
}

export function makeHistory(jobId = makeJob().id): StatusChange[] {
  return [
    {
      id: "h1",
      from: null,
      to: "Draft",
      note: null,
      changedAt: "2026-10-10T01:00:00Z",
    },
    {
      id: "h2",
      from: "Draft",
      to: "Scheduled",
      note: null,
      changedAt: "2026-10-11T01:00:00Z",
    },
  ].map((change) => ({
    ...change,
    id: `${jobId}-${change.id}`,
  })) as StatusChange[];
}

/** RFC 9457 body the API returns for errors. */
export function problem(
  status: number,
  extra: Record<string, unknown> = {},
): [Record<string, unknown>, ResponseInit] {
  return [
    { title: "Request failed", status, ...extra },
    { status, headers: { "Content-Type": "application/problem+json" } },
  ];
}
