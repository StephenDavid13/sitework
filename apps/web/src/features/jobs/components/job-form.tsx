"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, LocateFixed } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { useForm, useWatch, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { describeError, fieldErrors, isStaleVersion } from "@/lib/api/errors";
import { fromDateTimeLocal, toDateTimeLocal } from "@/lib/format";
import {
  JOB_PRIORITIES,
  PRIORITY_META,
  type CreateJobRequest,
  type Job,
  type JobPriority,
} from "../model";
import { ConflictDialog } from "./conflict-dialog";
import { LocationMap } from "./maps";

const locationMessage = "Pick the site on the map, or enter its coordinates.";

/** Mirrors the API's limits so most mistakes are caught before a round trip. */
export const jobFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give the job a title.")
    .max(200, "Keep the title under 200 characters."),
  description: z
    .string()
    .max(4000, "Keep the description under 4,000 characters."),
  priority: z.enum(JOB_PRIORITIES as [JobPriority, ...JobPriority[]]),
  latitude: z
    .number({ error: locationMessage })
    .min(-90, "Latitude must be between -90 and 90.")
    .max(90, "Latitude must be between -90 and 90."),
  longitude: z
    .number({ error: locationMessage })
    .min(-180, "Longitude must be between -180 and 180.")
    .max(180, "Longitude must be between -180 and 180."),
  siteName: z.string().max(200, "Keep the site name under 200 characters."),
  address: z.string().max(300, "Keep the address under 300 characters."),
  assignee: z.string().max(100, "Keep the assignee under 100 characters."),
  scheduledFor: z.string(),
});

export type JobFormValues = z.infer<typeof jobFormSchema>;

/** API field paths (camelCased) → form fields. */
const API_FIELDS: Record<string, FieldPath<JobFormValues>> = {
  title: "title",
  description: "description",
  priority: "priority",
  location: "latitude",
  "location.latitude": "latitude",
  "location.longitude": "longitude",
  siteName: "siteName",
  address: "address",
  assignee: "assignee",
  scheduledFor: "scheduledFor",
};

function toValues(job?: Job): JobFormValues {
  return {
    title: job?.title ?? "",
    description: job?.description ?? "",
    priority: job?.priority ?? "Normal",
    latitude: job?.location.latitude ?? Number.NaN,
    longitude: job?.location.longitude ?? Number.NaN,
    siteName: job?.siteName ?? "",
    address: job?.address ?? "",
    assignee: job?.assignee ?? "",
    scheduledFor: toDateTimeLocal(job?.scheduledFor),
  };
}

function toRequest(values: JobFormValues): CreateJobRequest {
  const optional = (value: string) => value.trim() || null;
  return {
    title: values.title.trim(),
    description: optional(values.description),
    priority: values.priority,
    location: { latitude: values.latitude, longitude: values.longitude },
    siteName: optional(values.siteName),
    address: optional(values.address),
    assignee: optional(values.assignee),
    scheduledFor: fromDateTimeLocal(values.scheduledFor),
  };
}

type JobFormProps = {
  job?: Job;
  submitLabel: string;
  cancelHref: string;
  onSubmit: (request: CreateJobRequest) => Promise<unknown>;
  /** Reloads the job after a version conflict (edit only). */
  onReload?: () => void;
};

export function JobForm({
  job,
  submitLabel,
  cancelHref,
  onSubmit,
  onReload,
}: JobFormProps) {
  const [conflict, setConflict] = useState(false);
  // Unique per form: Next keeps recently visited pages mounted (hidden), so fixed ids would collide.
  const formId = useId();
  const fieldId = (name: string) => `${formId}-${name}`;
  const form = useForm<JobFormValues>({
    resolver: zodResolver(jobFormSchema),
    defaultValues: toValues(job),
    mode: "onTouched",
  });
  const { register, handleSubmit, setValue, setError, control, formState } =
    form;
  const { errors, isSubmitting } = formState;

  const [latitude, longitude] = useWatch({
    control,
    name: ["latitude", "longitude"],
  });
  const location =
    Number.isFinite(latitude) && Number.isFinite(longitude)
      ? { latitude, longitude }
      : null;

  const setLocation = (value: { latitude: number; longitude: number }) => {
    setValue("latitude", value.latitude, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue("longitude", value.longitude, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(toRequest(values));
      if (!job) {
        // Next keeps visited pages mounted (hidden), so clear the create form for the next job.
        form.reset(toValues());
      }
    } catch (error) {
      if (isStaleVersion(error)) {
        setConflict(true);
        return;
      }
      let mapped = 0;
      for (const [path, message] of Object.entries(fieldErrors(error))) {
        const field = API_FIELDS[path];
        if (field) {
          setError(
            field,
            { type: "server", message },
            { shouldFocus: mapped === 0 },
          );
          mapped++;
        }
      }
      if (mapped === 0) {
        const { title, detail } = describeError(error);
        setError("root.server", {
          type: "server",
          message: `${title}. ${detail}`,
        });
      }
    }
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-8">
      <FieldGroup>
        <Field data-invalid={Boolean(errors.title)}>
          <FieldLabel htmlFor={fieldId("title")}>Title</FieldLabel>
          <Input
            id={fieldId("title")}
            autoComplete="off"
            aria-invalid={Boolean(errors.title)}
            {...register("title")}
          />
          <FieldError errors={[errors.title]} />
        </Field>

        <Field data-invalid={Boolean(errors.description)}>
          <FieldLabel htmlFor={fieldId("description")}>Description</FieldLabel>
          <Textarea
            id={fieldId("description")}
            rows={4}
            placeholder="What needs doing, access notes, materials…"
            aria-invalid={Boolean(errors.description)}
            {...register("description")}
          />
          <FieldError errors={[errors.description]} />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.priority)}>
            <FieldLabel htmlFor={fieldId("priority")}>Priority</FieldLabel>
            <NativeSelect id={fieldId("priority")} {...register("priority")}>
              {JOB_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {PRIORITY_META[priority].label}
                </option>
              ))}
            </NativeSelect>
            <FieldError errors={[errors.priority]} />
          </Field>

          <Field data-invalid={Boolean(errors.scheduledFor)}>
            <FieldLabel htmlFor={fieldId("scheduledFor")}>
              Scheduled for
            </FieldLabel>
            <Input
              id={fieldId("scheduledFor")}
              type="datetime-local"
              aria-invalid={Boolean(errors.scheduledFor)}
              {...register("scheduledFor")}
            />
            <FieldDescription>
              Optional for drafts. Required to schedule the job.
            </FieldDescription>
            <FieldError errors={[errors.scheduledFor]} />
          </Field>

          <Field data-invalid={Boolean(errors.assignee)}>
            <FieldLabel htmlFor={fieldId("assignee")}>Assignee</FieldLabel>
            <Input
              id={fieldId("assignee")}
              autoComplete="off"
              aria-invalid={Boolean(errors.assignee)}
              {...register("assignee")}
            />
            <FieldError errors={[errors.assignee]} />
          </Field>
        </div>
      </FieldGroup>

      <FieldSet>
        <FieldLegend>Location</FieldLegend>
        <FieldDescription>
          Click the map to drop a pin, drag it to adjust, or enter coordinates.
        </FieldDescription>

        <div className="h-72 overflow-hidden rounded-lg border sm:h-80">
          <LocationMap value={location} onChange={setLocation} />
        </div>

        <div className="grid gap-5 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
          <Field data-invalid={Boolean(errors.latitude)}>
            <FieldLabel htmlFor={fieldId("latitude")}>Latitude</FieldLabel>
            <Input
              id={fieldId("latitude")}
              type="number"
              step="any"
              inputMode="decimal"
              aria-invalid={Boolean(errors.latitude)}
              {...register("latitude", { valueAsNumber: true })}
            />
            <FieldError errors={[errors.latitude]} />
          </Field>
          <Field data-invalid={Boolean(errors.longitude)}>
            <FieldLabel htmlFor={fieldId("longitude")}>Longitude</FieldLabel>
            <Input
              id={fieldId("longitude")}
              type="number"
              step="any"
              inputMode="decimal"
              aria-invalid={Boolean(errors.longitude)}
              {...register("longitude", { valueAsNumber: true })}
            />
            <FieldError errors={[errors.longitude]} />
          </Field>
          <UseMyLocation onLocate={setLocation} />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.siteName)}>
            <FieldLabel htmlFor={fieldId("siteName")}>Site name</FieldLabel>
            <Input
              id={fieldId("siteName")}
              autoComplete="off"
              aria-invalid={Boolean(errors.siteName)}
              {...register("siteName")}
            />
            <FieldError errors={[errors.siteName]} />
          </Field>
          <Field data-invalid={Boolean(errors.address)}>
            <FieldLabel htmlFor={fieldId("address")}>Address</FieldLabel>
            <Input
              id={fieldId("address")}
              autoComplete="street-address"
              aria-invalid={Boolean(errors.address)}
              {...register("address")}
            />
            <FieldError errors={[errors.address]} />
          </Field>
        </div>
      </FieldSet>

      {errors.root?.server && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {errors.root.server.message}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 border-t pt-6">
        <Button variant="outline" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
          {submitLabel}
        </Button>
      </div>

      {job && onReload && (
        <ConflictDialog
          open={conflict}
          onOpenChange={setConflict}
          reference={job.reference}
          keepLabel="Keep my edits"
          onReload={() => {
            setConflict(false);
            onReload();
          }}
        />
      )}
    </form>
  );
}

function UseMyLocation({
  onLocate,
}: {
  onLocate: (value: { latitude: number; longitude: number }) => void;
}) {
  const [locating, setLocating] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      className="sm:mt-[22px]"
      disabled={locating}
      onClick={() => {
        if (!("geolocation" in navigator)) {
          toast.error("Your browser can't share its location.");
          return;
        }
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setLocating(false);
            onLocate({
              latitude: Math.round(position.coords.latitude * 1e6) / 1e6,
              longitude: Math.round(position.coords.longitude * 1e6) / 1e6,
            });
          },
          (error) => {
            setLocating(false);
            toast.error("We couldn't get your location", {
              description: error.message,
            });
          },
          { enableHighAccuracy: true, timeout: 10_000 },
        );
      }}
    >
      {locating ? (
        <Loader2 className="animate-spin" aria-hidden />
      ) : (
        <LocateFixed aria-hidden />
      )}
      Use my location
    </Button>
  );
}
