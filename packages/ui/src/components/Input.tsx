import type { InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export function Input({ label, hint, error, className, id, ...rest }: InputProps) {
  const inputId = id ?? (label ? `input-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);
  return (
    <label className="nc-field">
      {label ? <span className="nc-field__label">{label}</span> : null}
      <input
        id={inputId}
        className={["nc-input", error ? "nc-input--error" : "", className ?? ""]
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
