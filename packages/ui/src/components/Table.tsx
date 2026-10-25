import type { PropsWithChildren, ThHTMLAttributes, TdHTMLAttributes, HTMLAttributes } from "react";

export function Table({
  children,
  compact,
  className,
}: PropsWithChildren<{ compact?: boolean; className?: string }>) {
  return (
    <div className="nc-table-wrap">
      <table
        className={["nc-table", compact ? "nc-table--compact" : "", className ?? ""]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </table>
    </div>
  );
}

export function TableHead({ children }: PropsWithChildren) {
  return <thead>{children}</thead>;
}

export function TableBody({ children }: PropsWithChildren) {
  return <tbody>{children}</tbody>;
}

export function TableRow({
  children,
  className,
  ...rest
}: PropsWithChildren<HTMLAttributes<HTMLTableRowElement>>) {
  return (
    <tr className={className} {...rest}>
      {children}
    </tr>
  );
}

export function TableHeader({
  children,
  className,
  ...rest
}: PropsWithChildren<ThHTMLAttributes<HTMLTableCellElement>>) {
  return (
    <th className={className} {...rest}>
      {children}
    </th>
  );
}

export function TableCell({
  children,
  className,
  ...rest
}: PropsWithChildren<TdHTMLAttributes<HTMLTableCellElement>>) {
  return (
    <td className={className} {...rest}>
      {children}
    </td>
  );
}
