"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { describeError } from "@/lib/api/errors";
import { useDeleteJob } from "../api";
import type { Job } from "../model";

export function DeleteJobButton({ job }: { job: Job }) {
  const router = useRouter();
  const remove = useDeleteJob(job.id);
  const [open, setOpen] = useState(false);

  const confirm = async () => {
    try {
      await remove.mutateAsync();
      setOpen(false);
      toast.success(`${job.reference} deleted`);
      router.push("/jobs");
    } catch (error) {
      setOpen(false);
      const { title, detail } = describeError(error);
      toast.error(title, { description: detail });
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => !remove.isPending && setOpen(next)}
    >
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 aria-hidden />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {job.reference}?</AlertDialogTitle>
          <AlertDialogDescription>
            &ldquo;{job.title}&rdquo; and its history will be permanently
            removed. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>
            Keep job
          </AlertDialogCancel>
          {/* A plain button, so the dialog stays open while the request is in flight. */}
          <Button
            variant="destructive"
            onClick={confirm}
            disabled={remove.isPending}
          >
            {remove.isPending && (
              <Loader2 className="animate-spin" aria-hidden />
            )}
            Delete job
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
