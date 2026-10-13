import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Small uppercase kicker above a title or section. */
export function Eyebrow({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase",
        className,
      )}
      {...props}
    />
  );
}

/** A section heading row: the label on the left, an optional action on the right. */
export function SectionLabel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex min-h-7 items-center justify-between gap-2 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase",
        className,
      )}
      {...props}
    />
  );
}

export function Hint({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-sm leading-6 text-muted-foreground", className)} {...props} />;
}

export function ErrorText({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive",
        className,
      )}
      {...props}
    />
  );
}

/** Heading row at the top of an inspector panel. */
export function PanelHeading({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 font-heading text-[15px] font-semibold [&>svg]:size-4 [&>svg]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
