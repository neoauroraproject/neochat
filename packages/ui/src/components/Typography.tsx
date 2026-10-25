import type { HTMLAttributes, PropsWithChildren } from "react";

export type HeadingLevel = 1 | 2 | 3 | 4;

const headingTags = { 1: "h1", 2: "h2", 3: "h3", 4: "h4" } as const;

export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  level?: HeadingLevel;
}

export function Heading({ level = 2, className, children, ...rest }: HeadingProps) {
  const Tag = headingTags[level];
  const classes = ["nc-heading", `nc-heading--${level}`, className ?? ""].filter(Boolean).join(" ");
  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}

export interface TextProps extends HTMLAttributes<HTMLParagraphElement> {
  muted?: boolean;
  danger?: boolean;
  size?: "sm" | "md" | "lg";
}

export function Text({ muted, danger, size = "md", className, children, ...rest }: TextProps) {
  const classes = [
    "nc-text",
    size !== "md" ? `nc-text--${size}` : "",
    muted ? "nc-text--muted" : "",
    danger ? "nc-text--danger" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <p className={classes} {...rest}>
      {children}
    </p>
  );
}

export function Muted({
  className,
  children,
  ...rest
}: PropsWithChildren<HTMLAttributes<HTMLSpanElement>>) {
  return (
    <span
      className={["nc-text", "nc-text--sm", "nc-text--muted", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </span>
  );
}
