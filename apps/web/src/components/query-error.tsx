import { CircleAlert, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { describeError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

/** Inline error for a failed query, with the API's own explanation and a retry. */
export function QueryError({
  error,
  onRetry,
  isRetrying = false,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
}) {
  const { title, detail } = describeError(error);
  return (
    <div
      role="alert"
      className={cn(
        "flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm",
        className,
      )}
    >
      <CircleAlert
        className="mt-0.5 size-4 shrink-0 text-destructive"
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">{title}</p>
        <p className="mt-1 text-muted-foreground">{detail}</p>
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={onRetry}
            disabled={isRetrying}
          >
            <RotateCw
              className={cn(isRetrying && "animate-spin")}
              aria-hidden
            />
            {isRetrying ? "Retrying…" : "Try again"}
          </Button>
        )}
      </div>
    </div>
  );
}
