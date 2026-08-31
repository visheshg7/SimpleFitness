"use client";

import { useRef } from "react";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", danger = false, onConfirm, onCancel }: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  return <AlertDialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className="confirm-overlay" />
      <AlertDialogPrimitive.Content
        className="confirm-content"
        onOpenAutoFocus={(event) => { event.preventDefault(); confirmRef.current?.focus(); }}
      >
        <AlertDialogPrimitive.Title className="confirm-title">{title}</AlertDialogPrimitive.Title>
        <AlertDialogPrimitive.Description className="confirm-message">{message}</AlertDialogPrimitive.Description>
        <div className="confirm-actions">
          <AlertDialogPrimitive.Cancel className="button ghost">Cancel</AlertDialogPrimitive.Cancel>
          <AlertDialogPrimitive.Action ref={confirmRef} className={`button${danger ? " danger-button" : ""}`} onClick={onConfirm}>{confirmLabel}</AlertDialogPrimitive.Action>
        </div>
      </AlertDialogPrimitive.Content>
    </AlertDialogPrimitive.Portal>
  </AlertDialogPrimitive.Root>;
}
