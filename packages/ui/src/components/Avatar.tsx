export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}

export function Avatar({ name, src, size = 40, className }: AvatarProps) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  if (src) {
    return (
      <img
        className={["nc-avatar", className ?? ""].filter(Boolean).join(" ")}
        src={src}
        alt={name}
        width={size}
        height={size}
      />
    );
  }

  return (
    <span
      className={["nc-avatar", "nc-avatar--fallback", className ?? ""].filter(Boolean).join(" ")}
      style={{ width: size, height: size, fontSize: size * 0.35 }}
      aria-label={name}
    >
      {initials}
    </span>
  );
}
