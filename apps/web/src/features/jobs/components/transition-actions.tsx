"use client";

import { Loader2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  describeError,
  fieldErrors,
  isApiError,
  isStaleVersion,
} from "@/lib/api/errors";
import { fromDateTimeLocal, toDateTimeLocal } from "@/lib/format";
import { useTransitionJob } from "../api";
import {
  orderTransitions,
  STATUS_META,
  transitionLabel,
  type AllowedTransition,
  type Job,
} from "../model";

/**
 * One button per status change the server says is allowed from here. Changes that need a note
 * or a time open a dialog first.
 */
export function TransitionActions({
  job,
  onConflict,
}: {
  job: Job;
  onConflict: () => void;
}) {
  const transition = useTransitionJob(job.id);
  const [dialogFor, setDialogFor] = useState<AllowedTransition | null>(null);
  const transitions = orderTransitions(job.allowedTransitions);

  const reportError = (error: unknown) => {
    if (isStaleVersion(error)) {
      onConflict();
      return;
    }
    const { title, detail } = describeError(error);
    toast.error(title, { description: detail });
  };

  const run = async (
    target: AllowedTransition,
    note: string | null,
    scheduledFor: string | null,
  ) => {
    const updated = await transition.mutateAsync({
      to: target.to,
      note,
      scheduledFor,
      version: job.version,
    });
    toast.success(
      `${updated.reference} is now ${STATUS_META[updated.status].label.toLowerCase()}`,
    );
  };

  // The dialog stays mounted while a change is in flight so it can show the server's answer.
  return (
    <>
      {transition.isPending && !dialogFor && (
        <span
          role="status"
          className="inline-flex h-8 items-center gap-1.5 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Updating status…
        </span>
      )}
      {transitions.map((target, index) => (
        <Button
          key={target.to}
          disabled={transition.isPending}
          variant={
            target.to === "Cancelled"
              ? "destructive"
              : index === 0 && target.to !== "OnHold"
                ? "default"
                : "outline"
          }
          onClick={() => {
            if (target.requiresNote || target.requiresSchedule) {
              setDialogFor(target);
            } else {
              run(target, null, null).catch(reportError);
            }
          }}
        >
          {transitionLabel(job.status, target.to)}
        </Button>
      ))}

      {dialogFor && (
        <TransitionDialog
          job={job}
          target={dialogFor}
          onClose={() => setDialogFor(null)}
          onSubmit={(note, scheduledFor) => run(dialogFor, note, scheduledFor)}
          onConflict={() => {
            setDialogFor(null);
            onConflict();
          }}
        />
      )}
    </>
  );
}

function TransitionDialog({
  job,
  target,
  onClose,
  onSubmit,
  onConflict,
}: {
  job: Job;
  target: AllowedTransition;
  onClose: () => void;
  onSubmit: (note: string | null, scheduledFor: string | null) => Promise<void>;
  onConflict: () => void;
}) {
  const [note, setNote] = useState("");
  const [scheduledFor, setScheduledFor] = useState(() =>
    toDateTimeLocal(job.scheduledFor),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const label = transitionLabel(job.status, target.to);
  const id = useId();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const local: Record<string, string> = {};
    if (target.requiresNote && !note.trim()) {
      local.note = "Add a short note so others know why.";
    }
    if (target.requiresSchedule && !scheduledFor) {
      local.scheduledFor = "Choose when the work is scheduled.";
    }
    setErrors(local);
    if (Object.keys(local).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(note.trim() || null, fromDateTimeLocal(scheduledFor));
      onClose();
    } catch (error) {
      if (isStaleVersion(error)) {
        onConflict();
        return;
      }
      const fields = fieldErrors(error);
      if (isApiError(error, 400) && (fields.note || fields.scheduledFor)) {
        setErrors(fields);
      } else {
        const { title, detail } = describeError(error);
        setErrors({ form: `${title}. ${detail}` });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {label} {job.reference}
            </DialogTitle>
            <DialogDescription>
              {target.to === "Cancelled"
                ? "Cancelled jobs are kept for the record but can no longer be changed."
                : `Moves the job to ${STATUS_META[target.to].label.toLowerCase()}.`}
            </DialogDescription>
          </DialogHeader>

          {target.requiresSchedule && (
            <Field data-invalid={Boolean(errors.scheduledFor)}>
              <FieldLabel htmlFor={`${id}-scheduled-for`}>
                Scheduled for
              </FieldLabel>
              <Input
                id={`${id}-scheduled-for`}
                type="datetime-local"
                value={scheduledFor}
                onChange={(event) => setScheduledFor(event.target.value)}
                aria-invalid={Boolean(errors.scheduledFor)}
              />
              {errors.scheduledFor && (
                <FieldError>{errors.scheduledFor}</FieldError>
              )}
            </Field>
          )}

          {target.requiresNote && (
            <Field data-invalid={Boolean(errors.note)}>
              <FieldLabel htmlFor={`${id}-note`}>
                {target.to === "Cancelled" ? "Reason for cancelling" : "Note"}
              </FieldLabel>
              <Textarea
                id={`${id}-note`}
                value={note}
                maxLength={1000}
                onChange={(event) => setNote(event.target.value)}
                placeholder={
                  target.to === "OnHold"
                    ? "e.g. Waiting on parts from the supplier"
                    : undefined
                }
                aria-invalid={Boolean(errors.note)}
              />
              {errors.note && <FieldError>{errors.note}</FieldError>}
            </Field>
          )}

          {errors.form && (
            <p role="alert" className="text-sm text-destructive">
              {errors.form}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
            >
              Back
            </Button>
            <Button
              type="submit"
              variant={target.to === "Cancelled" ? "destructive" : "default"}
              disabled={submitting}
            >
              {submitting && <Loader2 className="animate-spin" aria-hidden />}
              {label}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
