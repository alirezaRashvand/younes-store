"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

/**
 * Lightweight form helpers (no react-hook-form coupling). Wires label,
 * description and error message to the control via aria attributes.
 *
 * <Field label="شماره موبایل" error={errors.phone?.message}>
 *   <FormControl><Input /></FormControl>
 * </Field>
 */
interface FieldContextValue {
  id: string;
  descriptionId: string;
  messageId: string;
  invalid: boolean;
}

const FieldContext = React.createContext<FieldContextValue | null>(null);

function useField() {
  const ctx = React.useContext(FieldContext);
  if (!ctx) throw new Error("FormControl باید داخل Field استفاده شود.");
  return ctx;
}

function Field({
  label,
  description,
  error,
  required,
  className,
  children,
  id: idProp,
}: {
  label?: React.ReactNode;
  description?: React.ReactNode;
  error?: string | { message?: string } | null;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
  id?: string;
}) {
  const reactId = React.useId();
  const id = idProp ?? reactId;
  const message = typeof error === "string" ? error : error?.message;

  return (
    <FieldContext.Provider
      value={{
        id,
        descriptionId: `${id}-description`,
        messageId: `${id}-message`,
        invalid: Boolean(message),
      }}
    >
      <div data-slot="field" className={cn("grid gap-2", className)}>
        {label ? (
          <Label htmlFor={id}>
            {label}
            {required ? (
              <span aria-hidden="true" className="text-destructive">
                *
              </span>
            ) : null}
          </Label>
        ) : null}
        {children}
        {description ? <FieldDescription>{description}</FieldDescription> : null}
        <FieldMessage>{message}</FieldMessage>
      </div>
    </FieldContext.Provider>
  );
}

function FormControl({ ...props }: React.ComponentProps<typeof Slot>) {
  const { id, descriptionId, messageId, invalid } = useField();
  return (
    <Slot
      data-slot="form-control"
      id={id}
      aria-describedby={invalid ? `${descriptionId} ${messageId}` : descriptionId}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  const { descriptionId } = useField();
  return (
    <p
      id={descriptionId}
      data-slot="field-description"
      className={cn("text-[0.8125rem] text-muted-foreground", className)}
      {...props}
    />
  );
}

function FieldMessage({ className, children, ...props }: React.ComponentProps<"p">) {
  const { messageId } = useField();
  if (!children) return null;
  return (
    <p
      id={messageId}
      role="alert"
      data-slot="field-message"
      className={cn("text-[0.8125rem] font-medium text-destructive", className)}
      {...props}
    >
      {children}
    </p>
  );
}

export { Field, FormControl, FieldDescription, FieldMessage, useField };
