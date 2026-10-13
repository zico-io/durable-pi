"use client";
import type { ComponentProps, ReactNode } from "react";
import { X } from "lucide-react";
import { AnimatedModal, AnimatedModalTitle } from "@/components/motion/animated-modal";
import { Button } from "@/components/motion/button";
import { Eyebrow } from "@/components/ui/text";
import { cn } from "@/lib/utils";

/** The app's dialog: beUI's animated modal on the card surface. */
export function Modal({
  open,
  onClose,
  onExited,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onExited?: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <AnimatedModal
      open={open}
      onOpenChange={(next) => !next && onClose()}
      onExitComplete={onExited}
      backdropClassName="bg-black/50 backdrop-blur-sm"
      panelClassName={cn("flex flex-col gap-5 bg-card p-6 shadow-2xl", className)}
    >
      {children}
    </AnimatedModal>
  );
}

export function ModalHeader({
  eyebrow,
  title,
  closeLabel,
  onClose,
  disabled,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  closeLabel: string;
  onClose: () => void;
  disabled?: boolean;
}) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="grid gap-1.5">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <AnimatedModalTitle className="font-heading text-lg font-semibold">
          {title}
        </AnimatedModalTitle>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={closeLabel}
        disabled={disabled}
        onClick={onClose}
        className="-mt-1 -mr-2"
      >
        <X className="size-4" />
      </Button>
    </header>
  );
}

export function ModalFooter({ className, ...props }: ComponentProps<"footer">) {
  return <footer className={cn("flex justify-end gap-2 pt-1", className)} {...props} />;
}
