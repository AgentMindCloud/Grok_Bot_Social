"use client";
import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
export default function Modal({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const focusable = () =>
    Array.from(
      ref.current?.querySelectorAll<HTMLElement>(
        'button,a[href],input,textarea,select,summary,[tabindex]',
      ) || [],
    ).filter((element) =>
      element.tabIndex >= 0 &&
      !element.matches(":disabled") &&
      !element.closest("[hidden],[inert]") &&
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== "hidden" &&
      getComputedStyle(element).visibility !== "collapse",
    );
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (focusable()[0] || ref.current)?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busyRef.current) closeRef.current();
      }
      if (event.key === "Tab") {
        const nodes = focusable();
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (!first || !nodes.includes(document.activeElement as HTMLElement)) {
          event.preventDefault();
          (event.shiftKey ? last || ref.current : first || ref.current)?.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      if (returnFocusRef.current?.isConnected)
        returnFocusRef.current.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    if (
      busy &&
      (!ref.current?.contains(document.activeElement) ||
        document.activeElement?.matches(":disabled"))
    )
      (focusable()[0] || ref.current)?.focus();
  }, [busy]);
  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={ref}
        className="modal"
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal-heading">
          <h2 id={titleId}>{title}</h2>
          <button
            className="icon-button"
            type="button"
            aria-label="Close dialog"
            disabled={busy}
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
