import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";

export type ToastTone = "default" | "success" | "danger" | "warning";

export interface ToastItem {
  id: string;
  message: ReactNode;
  tone?: ToastTone;
  duration?: number;
}

interface ToastContextValue {
  toast: (message: ReactNode, options?: { tone?: ToastTone; duration?: number }) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastCounter = 0;

export function ToastProvider({ children }: PropsWithChildren) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: ReactNode, options?: { tone?: ToastTone; duration?: number }) => {
      const id = `toast-${++toastCounter}`;
      const duration = options?.duration ?? 4000;
      setItems((prev) => [...prev, { id, message, tone: options?.tone ?? "default", duration }]);
      if (duration > 0) {
        window.setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

function ToastContainer({
  items,
  onDismiss,
}: {
  items: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="nc-toast-container" aria-live="polite">
      {items.map((item) => (
        <div
          key={item.id}
          className={[
            "nc-toast",
            item.tone && item.tone !== "default" ? `nc-toast--${item.tone}` : "",
          ]
            .filter(Boolean)
            .join(" ")}
          role="status"
        >
          <div className="nc-toast__message">{item.message}</div>
          <button
            type="button"
            className="nc-toast__close"
            aria-label="Dismiss"
            onClick={() => onDismiss(item.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function Toast({ message, tone = "default" }: { message: ReactNode; tone?: ToastTone }) {
  return (
    <div
      className={["nc-toast", tone !== "default" ? `nc-toast--${tone}` : ""]
        .filter(Boolean)
        .join(" ")}
      role="status"
    >
      <div className="nc-toast__message">{message}</div>
    </div>
  );
}
