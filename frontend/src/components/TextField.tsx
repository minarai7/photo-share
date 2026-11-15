import type { ReactNode } from "react";
import clsx from "clsx";
import { Field } from "@base-ui/react/field";
import "./forms.css";

type TextFieldProps = {
    label: string;
    value: string;
    onChange: (value: string) => void;
    error?: string | null;
    hint?: ReactNode;
    type?: "text" | "email" | "password";
    placeholder?: string;
    autoComplete?: string;
    name?: string;
    disabled?: boolean;
    className?: string;
};

/**
 * A display-caps label over a serif input with only a bottom rule, which
 * turns ink on focus. Hint and error below in serif italic; an error is
 * --danger and marks the input aria-invalid.
 */
export function TextField({ label, value, onChange, error, hint, type = "text", placeholder, autoComplete, name, disabled, className }: TextFieldProps) {
    return (
        <Field.Root className={clsx("tf", className)} invalid={!!error} disabled={disabled}>
            <Field.Label className="tf-label">{label}</Field.Label>
            <Field.Control
                className="tf-input"
                type={type}
                name={name}
                value={value}
                placeholder={placeholder}
                autoComplete={autoComplete}
                onChange={(e) => onChange(e.target.value)}
            />
            {hint && !error && <Field.Description className="tf-hint">{hint}</Field.Description>}
            {error && (
                <Field.Error className="tf-error" match>
                    {error}
                </Field.Error>
            )}
        </Field.Root>
    );
}

/** An error for the whole form, at its top. */
export function FormError({ children }: { children: ReactNode }) {
    return (
        <p className="form-error" role="alert">
            {children}
        </p>
    );
}
