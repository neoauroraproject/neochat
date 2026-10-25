import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: "nc-btn--primary",
  secondary: "nc-btn--secondary",
  ghost: "nc-btn--ghost",
  danger: "nc-btn--danger",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "nc-btn--sm",
  md: "",
  lg: "nc-btn--lg",
};

export function Button({
  variant = "primary",
  size = "md",
  block,
  className,
  ...rest
}: ButtonProps) {
  const classes = [
    "nc-btn",
    variantClass[variant],
    sizeClass[size],
    block ? "nc-btn--block" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return <button className={classes} {...rest} />;
}
