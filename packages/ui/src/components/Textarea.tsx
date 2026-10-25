import type { TextareaHTMLAttributes } from "react";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export function Textarea({ label, hint, error, className, id, ...rest }: TextareaProps) {
  const inputId =
    id ?? (label ? `textarea-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);
  return (
    <label className="nc-field">
      {label ? <span className="nc-field__label">{label}</span> : null}
      <textarea
        id={inputId}
        className={["nc-textarea", error ? "nc-textarea--error" : "", className ?? ""]
          .filter(Boolean)
          .join(" ")}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
      {error ? <span className="nc-field__error">{error}</span> : null}
      {!error && hint ? <span className="nc-field__hint">{hint}</span> : null}
    </label>
  );
}
