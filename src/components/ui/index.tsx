import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Info,
  Search,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

type ButtonTone = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  children,
  tone = "secondary",
  size,
  icon: Icon,
  loading = false,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: ButtonTone;
  size?: "sm" | "lg";
  icon?: LucideIcon;
  loading?: boolean;
}) {
  const classes = [
    "pn-btn",
    `pn-btn--${tone}`,
    size ? `pn-btn--${size}` : "",
    rest.title && !children ? "pn-btn--icon" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" {...rest} className={classes} disabled={rest.disabled || loading}>
      {loading ? <span className="pn-spinner" aria-hidden="true" /> : Icon ? <Icon aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  icon: Icon,
  label,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string }) {
  return (
    <button type="button" aria-label={label} title={label} {...rest} className={`pn-icon-btn ${rest.className || ""}`}>
      <Icon aria-hidden="true" />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

export function Card({ children, className = "", ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={`pn-card ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  eyebrowIcon,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  eyebrowIcon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="pn-page-head">
      <div>
        {eyebrow && (
          <div className="pn-eyebrow">
            {eyebrowIcon ? React.createElement(eyebrowIcon) : null}
            {eyebrow}
          </div>
        )}
        <h1 className="pn-title">{title}</h1>
        {description ? <p className="pn-subtitle">{description}</p> : null}
      </div>
      {actions ? <div className="pn-head-actions">{actions}</div> : null}
    </header>
  );
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`pn-card ${className}`}>
      {title || action ? (
        <div className="pn-card-head">
          <div>
            {title ? <h3>{title}</h3> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className={bodyClassName || "pn-card-body"}>{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Data display                                                        */
/* ------------------------------------------------------------------ */

export type StatusTone = "online" | "offline" | "warning" | "danger" | "info" | "accent";

export function Badge({
  tone = "offline",
  children,
  dot = false,
  live = false,
}: {
  tone?: StatusTone;
  children: React.ReactNode;
  dot?: boolean;
  live?: boolean;
}) {
  return (
    <span className={`pn-badge pn-badge--${tone}`}>
      {dot ? <i className={`pn-dot ${live ? "is-live" : ""}`} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function statusTone(status?: string): StatusTone {
  const value = String(status || "").toUpperCase();
  if (["ONLINE", "RUNNING", "READY", "ACTIVE"].includes(value)) return "online";
  if (["INSTALLING", "STARTING", "STOPPING", "RESTARTING", "PENDING", "PROVISIONING"].includes(value)) return "info";
  if (["MAINTENANCE", "SUSPENDED", "SETUP_REQUIRED", "WARNING"].includes(value)) return "warning";
  if (["ERROR", "FAILED", "CRASHED"].includes(value)) return "danger";
  if (value === "DISABLED") return "offline";
  return "offline";
}

export function statusLabel(status?: string) {
  const value = String(status || "OFFLINE").replace(/_/g, " ").toLowerCase();
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function Meter({ value, tone }: { value: number; tone?: "warn" | "danger" | "info" }) {
  const safe = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const derived = tone || (safe >= 92 ? "danger" : safe >= 78 ? "warn" : undefined);
  return (
    <div className={`pn-meter ${derived ? `is-${derived}` : ""}`} role="presentation">
      <span style={{ width: `${safe}%` }} />
    </div>
  );
}

export function Ring({ value, label, size = 52, color }: { value: number; label: string; size?: number; color?: string }) {
  const safe = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div
      className="pn-ring"
      role="img"
      aria-label={`${label}: ${Math.round(safe)}%`}
      style={{ width: size, height: size, flexBasis: size, ["--value" as string]: safe, ...(color ? { ["--ring-color" as string]: color } : {}) }}
    >
      <b>{Math.round(safe)}%</b>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="pn-empty">
      <div className="pn-empty-icon">
        <Icon aria-hidden="true" />
      </div>
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}

export function Spinner({ large = false }: { large?: boolean }) {
  return <span className={`pn-spinner ${large ? "pn-spinner--lg" : ""}`} role="status" aria-label="Loading" />;
}

export function Skeleton({ height = 14, width = "100%", radius }: { height?: number; width?: number | string; radius?: number }) {
  return <div className="pn-skel" style={{ height, width, borderRadius: radius }} aria-hidden="true" />;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; icon?: LucideIcon }[];
  label?: string;
}) {
  return (
    <div className="pn-seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          className={value === option.value ? "is-active" : ""}
          onClick={() => onChange(option.value)}
        >
          {option.icon ? React.createElement(option.icon) : null}
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Forms                                                               */
/* ------------------------------------------------------------------ */

export function Field({
  label,
  hint,
  error,
  children,
  className = "",
}: {
  label?: string;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`pn-field ${className}`}>
      {label ? <label>{label}</label> : null}
      {children}
      {error ? <span className="pn-field-error">{error}</span> : hint ? <span className="pn-field-hint">{hint}</span> : null}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <div className="pn-switch">
      <div className="pn-switch-copy">
        <b>{label}</b>
        {description ? <span>{description}</span> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="pn-toggle"
        style={disabled ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
      />
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel?: string;
}) {
  return (
    <div className="pn-input-group">
      <Search aria-hidden="true" />
      <input
        className="pn-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Copy                                                                */
/* ------------------------------------------------------------------ */

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button type="button" className="pn-copy" onClick={copy} aria-label={label} title={label}>
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size,
  labelId = "pn-modal-title",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "wide";
  labelId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="pn-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        ref={ref}
        className={`pn-modal ${size === "wide" ? "pn-modal--wide" : size === "sm" ? "pn-modal--sm" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
      >
        <div className="pn-modal-head">
          <div>
            <h2 id={labelId}>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button type="button" className="pn-icon-btn" onClick={onClose} aria-label="Close dialog">
            <X aria-hidden="true" />
          </button>
        </div>
        {children}
        {footer ? <div className="pn-modal-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

type ToastTone = "success" | "error" | "info";
type ToastItem = { id: number; tone: ToastTone; title: string; description?: string };

const ToastContext = createContext<{ push: (toast: Omit<ToastItem, "id">) => void } | null>(null);

const TOAST_ICON: Record<ToastTone, LucideIcon> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const push = useCallback((toast: Omit<ToastItem, "id">) => {
    const id = ++counter.current;
    setItems((current) => [...current.slice(-3), { ...toast, id }]);
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 5200);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  const dismiss = (id: number) => setItems((current) => current.filter((item) => item.id !== id));
  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="pn-toasts" aria-live="polite" aria-atomic="false">
          {items.map((item) => {
            const Icon = TOAST_ICON[item.tone];
            return (
              <div key={item.id} className={`pn-toast pn-toast--${item.tone}`} role="status">
                <Icon className="pn-toast-icon" aria-hidden="true" />
                <div className="pn-toast-copy">
                  <div className="pn-toast-title">{item.title}</div>
                  {item.description ? <div className="pn-toast-desc">{item.description}</div> : null}
                </div>
                <button type="button" className="pn-toast-close" onClick={() => dismiss(item.id)} aria-label="Dismiss notification">
                  <X size={13} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return {
    success: (title: string, description?: string) => context.push({ tone: "success", title, description }),
    error: (title: string, description?: string) => context.push({ tone: "error", title, description }),
    info: (title: string, description?: string) => context.push({ tone: "info", title, description }),
  };
}

/* ------------------------------------------------------------------ */
/* Confirm                                                             */
/* ------------------------------------------------------------------ */

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
};

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<(ConfirmOptions & { resolve: (value: boolean) => void }) | null>(null);
  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setRequest({ ...options, resolve });
      }),
    [],
  );
  const close = (value: boolean) => {
    request?.resolve(value);
    setRequest(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={Boolean(request)}
        onClose={() => close(false)}
        title={request?.title || ""}
        description={request?.description}
        size="sm"
        labelId="pn-confirm-title"
        footer={
          <>
            <Button tone="ghost" onClick={() => close(false)}>{request?.cancelLabel || "Cancel"}</Button>
            <Button tone={request?.tone === "primary" ? "primary" : "danger"} onClick={() => close(true)}>
              {request?.confirmLabel || "Confirm"}
            </Button>
          </>
        }
      >
        <div className="pn-modal-body">
          <div className={`pn-callout ${request?.tone === "primary" ? "pn-callout--accent" : "pn-callout--danger"}`}>
            <AlertTriangle aria-hidden="true" />
            <span>This action takes effect immediately. Review the details before continuing.</span>
          </div>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("useConfirm must be used inside ConfirmProvider");
  return context;
}

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

export function formatBytes(bytes?: number | null, digits = 1): string {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  const amount = value / Math.pow(1024, index);
  return `${amount.toFixed(index === 0 ? 0 : digits)} ${units[index]}`;
}

export function formatPercent(value?: number | null, digits = 1): string {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(digits)}%` : "—";
}

export function timeAgo(input?: string | number | Date | null): string {
  if (!input) return "never";
  const timestamp = input instanceof Date ? input.getTime() : typeof input === "number" ? input : Date.parse(input);
  if (!Number.isFinite(timestamp)) return "never";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function uptimeLabel(seconds?: number | null): string {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return "—";
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
