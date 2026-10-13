"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Shown when a write is rejected because someone else changed the job first (409 stale_version). */
export function ConflictDialog({
  open,
  onOpenChange,
  onReload,
  reference,
  keepLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReload: () => void;
  reference: string;
  /** Offer to keep the user's unsaved edits on screen instead of reloading. */
  keepLabel?: string;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {reference} was changed by someone else
          </AlertDialogTitle>
          <AlertDialogDescription>
            Someone updated this job after you opened it, so your change
            wasn&apos;t saved. Reload to see the latest version, then try again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {keepLabel && <AlertDialogCancel>{keepLabel}</AlertDialogCancel>}
          <AlertDialogAction onClick={onReload}>
            Reload latest
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
