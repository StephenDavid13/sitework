import { ArrowDown, ArrowUp, ChevronsUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PRIORITY_META,
  STATUS_META,
  type JobPriority,
  type JobStatus,
} from "../model";

export function StatusBadge({
  status,
  className,
}: {
  status: JobStatus;
  className?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        meta.badge,
        className,
      )}
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full"
        style={{ backgroundColor: meta.color }}
      />
      {meta.label}
    </span>
  );
}

const PRIORITY_ICON = {
  Low: ArrowDown,
  Normal: null,
  High: ArrowUp,
  Urgent: ChevronsUp,
} as const;

export function PriorityLabel({
  priority,
  className,
}: {
  priority: JobPriority;
  className?: string;
}) {
  const Icon = PRIORITY_ICON[priority];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs whitespace-nowrap",
        priority === "Urgent" && "font-semibold text-red-700",
        priority === "High" && "font-medium text-orange-700",
        (priority === "Normal" || priority === "Low") &&
          "text-muted-foreground",
        className,
      )}
    >
      {Icon && <Icon className="size-3.5" aria-hidden />}
      {PRIORITY_META[priority].label} priority
    </span>
  );
}
