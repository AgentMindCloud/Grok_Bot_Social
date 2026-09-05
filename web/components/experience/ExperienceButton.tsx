"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ForwardedRef,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useMotionPreferences } from "@/lib/use-motion-preferences";
import "./experience-button.css";

type ControlAppearance = {
  variant?: "cyan" | "pink" | "amber" | "quiet";
  size?: "default" | "small" | "hero";
};

export type ExperienceButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  ControlAppearance & { loading?: boolean };

export type ExperienceLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> &
  ControlAppearance & { disabled?: boolean };

/** Pointer effects stay local to the control and never change its hit area. */
function useTactileControl<T extends HTMLElement>(
  forwardedRef: ForwardedRef<T>,
  disabled: boolean,
) {
  const element = useRef<T | null>(null);
  const { enabled } = useMotionPreferences();
  const motionEnabled = enabled && !disabled;
  const ref = useCallback(
    (node: T | null) => {
      element.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef],
  );

  const reset = useCallback(() => {
    const node = element.current;
    if (!node) return;
    node.style.setProperty("--xp-control-rx", "0deg");
    node.style.setProperty("--xp-control-ry", "0deg");
    node.style.setProperty("--xp-control-mx", "0px");
    node.style.setProperty("--xp-control-my", "0px");
    node.style.setProperty("--xp-control-light-x", "50%");
    node.style.setProperty("--xp-control-light-y", "0%");
  }, []);

  useEffect(() => {
    if (!motionEnabled) reset();
  }, [motionEnabled, reset]);

  const move = useCallback(
    (event: PointerEvent<T>) => {
      if (!motionEnabled || event.pointerType === "touch") return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const x = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2));
      const y = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2));
      const node = event.currentTarget;
      node.style.setProperty("--xp-control-rx", `${-y * 3}deg`);
      node.style.setProperty("--xp-control-ry", `${x * 3}deg`);
      node.style.setProperty("--xp-control-mx", `${x * 2}px`);
      node.style.setProperty("--xp-control-my", `${y * 2}px`);
      node.style.setProperty("--xp-control-light-x", `${(x + 1) * 50}%`);
      node.style.setProperty("--xp-control-light-y", `${(y + 1) * 50}%`);
    },
    [motionEnabled],
  );

  return { ref, motionEnabled, move, reset };
}

function ControlLayers({ children, loading = false }: { children: ReactNode; loading?: boolean }) {
  return (
    <span className="xp-control__shell">
      <span className="xp-control__chrome" aria-hidden="true" />
      <span className="xp-control__liquid" aria-hidden="true" />
      <span className="xp-control__light" aria-hidden="true" />
      <span className="xp-control__glint" aria-hidden="true" />
      <span className="xp-control__label">
        {loading && <span className="xp-control__busy" aria-hidden="true" />}
        {children}
      </span>
    </span>
  );
}

/** Native button semantics, with the label and supplied icons kept as real DOM. */
export const ExperienceButton = forwardRef<HTMLButtonElement, ExperienceButtonProps>(
  function ExperienceButton(
    {
      children,
      className = "",
      variant = "cyan",
      size = "default",
      loading = false,
      disabled = false,
      type = "button",
      onPointerMove,
      onPointerLeave,
      onPointerCancel,
      onBlur,
      ...props
    },
    forwardedRef,
  ) {
    const blocked = disabled || loading;
    const tactile = useTactileControl(forwardedRef, blocked);
    return (
      <button
        {...props}
        ref={tactile.ref}
        type={type}
        disabled={blocked}
        aria-busy={loading || props["aria-busy"]}
        className={`xp-control xp-control--${variant} xp-control--${size} ${className}`.trim()}
        data-motion={tactile.motionEnabled ? "on" : "off"}
        onPointerMove={(event) => {
          onPointerMove?.(event);
          if (!event.defaultPrevented) tactile.move(event);
        }}
        onPointerLeave={(event) => {
          tactile.reset();
          onPointerLeave?.(event);
        }}
        onPointerCancel={(event) => {
          tactile.reset();
          onPointerCancel?.(event);
        }}
        onBlur={(event) => {
          tactile.reset();
          onBlur?.(event);
        }}
      >
        <ControlLayers loading={loading}>{children}</ControlLayers>
      </button>
    );
  },
);

/** Native anchor: command/control click, focus, and navigation keep working. */
export const ExperienceLink = forwardRef<HTMLAnchorElement, ExperienceLinkProps>(
  function ExperienceLink(
    {
      children,
      className = "",
      variant = "cyan",
      size = "default",
      disabled = false,
      href,
      tabIndex,
      onClick,
      onPointerMove,
      onPointerLeave,
      onPointerCancel,
      onBlur,
      ...props
    },
    forwardedRef,
  ) {
    const tactile = useTactileControl(forwardedRef, disabled);
    return (
      <a
        {...props}
        ref={tactile.ref}
        href={disabled ? undefined : href}
        role={props.role ?? (disabled ? "link" : undefined)}
        aria-disabled={disabled || props["aria-disabled"]}
        tabIndex={disabled ? -1 : tabIndex}
        className={`xp-control xp-control--${variant} xp-control--${size} ${className}`.trim()}
        data-motion={tactile.motionEnabled ? "on" : "off"}
        onClick={(event) => {
          if (disabled) event.preventDefault();
          else onClick?.(event);
        }}
        onPointerMove={(event) => {
          onPointerMove?.(event);
          if (!event.defaultPrevented) tactile.move(event);
        }}
        onPointerLeave={(event) => {
          tactile.reset();
          onPointerLeave?.(event);
        }}
        onPointerCancel={(event) => {
          tactile.reset();
          onPointerCancel?.(event);
        }}
        onBlur={(event) => {
          tactile.reset();
          onBlur?.(event);
        }}
      >
        <ControlLayers>{children}</ControlLayers>
      </a>
    );
  },
);
