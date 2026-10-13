"use client";

import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api/client";
import type { operations } from "@/lib/api/schema";
import type {
  CreateJobRequest,
  Job,
  TransitionRequest,
  UpdateJobRequest,
} from "./model";

export type JobListParams = NonNullable<
  operations["ListJobs"]["parameters"]["query"]
>;
export type JobMapParams = NonNullable<
  operations["ListJobMapPoints"]["parameters"]["query"]
>;

export const jobKeys = {
  all: ["jobs"] as const,
  list: (params: JobListParams) => ["jobs", "list", params] as const,
  map: (params: JobMapParams) => ["jobs", "map", params] as const,
  stats: () => ["jobs", "stats"] as const,
  detail: (id: string) => ["jobs", "detail", id] as const,
  history: (id: string) => ["jobs", "history", id] as const,
};

export const jobQueries = {
  list: (params: JobListParams) =>
    queryOptions({
      queryKey: jobKeys.list(params),
      queryFn: ({ signal }) =>
        unwrap(api.GET("/api/jobs", { params: { query: params }, signal })),
      placeholderData: keepPreviousData,
    }),
  map: (params: JobMapParams) =>
    queryOptions({
      queryKey: jobKeys.map(params),
      queryFn: ({ signal }) =>
        unwrap(api.GET("/api/jobs/map", { params: { query: params }, signal })),
      placeholderData: keepPreviousData,
    }),
  stats: () =>
    queryOptions({
      queryKey: jobKeys.stats(),
      queryFn: ({ signal }) => unwrap(api.GET("/api/jobs/stats", { signal })),
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: jobKeys.detail(id),
      queryFn: ({ signal }) =>
        unwrap(api.GET("/api/jobs/{id}", { params: { path: { id } }, signal })),
    }),
  history: (id: string) =>
    queryOptions({
      queryKey: jobKeys.history(id),
      queryFn: ({ signal }) =>
        unwrap(
          api.GET("/api/jobs/{id}/history", {
            params: { path: { id } },
            signal,
          }),
        ),
    }),
};

/** Lists, map points and counts are all derived from every job, so any write makes them stale. */
function invalidateCollections(queryClient: QueryClient) {
  return Promise.all(
    (["list", "map", "stats"] as const).map((kind) =>
      queryClient.invalidateQueries({ queryKey: ["jobs", kind] }),
    ),
  );
}

export function useCreateJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateJobRequest) =>
      unwrap(api.POST("/api/jobs", { body })),
    onSuccess: (job) => {
      queryClient.setQueryData(jobKeys.detail(job.id), job);
      return invalidateCollections(queryClient);
    },
  });
}

export function useUpdateJob(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateJobRequest) =>
      unwrap(api.PUT("/api/jobs/{id}", { params: { path: { id } }, body })),
    onSuccess: (job) => {
      queryClient.setQueryData(jobKeys.detail(id), job);
      return invalidateCollections(queryClient);
    },
  });
}

/**
 * Optimistically shows the new status (with no further actions until the server answers),
 * and rolls back if the change is rejected.
 */
export function useTransitionJob(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TransitionRequest) =>
      unwrap(
        api.POST("/api/jobs/{id}/transitions", {
          params: { path: { id } },
          body,
        }),
      ),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: jobKeys.detail(id) });
      const previous = queryClient.getQueryData<Job>(jobKeys.detail(id));
      if (previous) {
        queryClient.setQueryData<Job>(jobKeys.detail(id), {
          ...previous,
          status: body.to,
          allowedTransitions: [],
        });
      }
      return { previous };
    },
    onError: (_error, _body, context) => {
      if (context?.previous) {
        queryClient.setQueryData(jobKeys.detail(id), context.previous);
      }
    },
    onSuccess: (job) => queryClient.setQueryData(jobKeys.detail(id), job),
    onSettled: () =>
      Promise.all([
        invalidateCollections(queryClient),
        queryClient.invalidateQueries({ queryKey: jobKeys.history(id) }),
      ]),
  });
}

export function useDeleteJob(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      unwrap(api.DELETE("/api/jobs/{id}", { params: { path: { id } } })),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: jobKeys.detail(id) });
      queryClient.removeQueries({ queryKey: jobKeys.history(id) });
      return invalidateCollections(queryClient);
    },
  });
}

/** Re-fetches a job after a conflict so the user sees what changed. */
export function useReloadJob(id: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: jobKeys.detail(id) }),
      queryClient.invalidateQueries({ queryKey: jobKeys.history(id) }),
    ]);
}
