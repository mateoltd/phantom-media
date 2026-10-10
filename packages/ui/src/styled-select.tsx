"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { CaretDown, Check } from "@phosphor-icons/react/ssr";

export interface StyledSelectOption {
  value: string;
  label: string;
  detail?: string;
}

interface StyledSelectProps {
  id?: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly StyledSelectOption[];
  disabled?: boolean;
  placeholder?: string;
  showSelectedDetail?: boolean;
  compact?: boolean;
  variant?: "default" | "quiet";
}

interface MenuPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  origin: "top" | "bottom";
}

export function StyledSelect({
  id,
  label,
  value,
  onValueChange,
  options,
  disabled = false,
  placeholder = "Select an option",
  showSelectedDetail = false,
  compact = false,
  variant = "default",
}: StyledSelectProps) {
  const generatedId = useId();
  const triggerId = id ?? `styled-select-${generatedId}`;
  const labelId = `${triggerId}-label`;
  const listboxId = `${triggerId}-listbox`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setMenuPosition(null);
  }, []);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedOption = options[selectedIndex];

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    // Fixed portals start inside the root's reserved scrollbar gutters.
    const viewport = document.documentElement.getBoundingClientRect();
    const viewportMargin = 8;
    const gap = 8;
    const desiredHeight = Math.min(288, options.length * 48 + 12);
    const below = window.innerHeight - rect.bottom - gap - viewportMargin;
    const above = rect.top - gap - viewportMargin;
    const placeAbove = below < Math.min(desiredHeight, 180) && above > below;
    const availableHeight = placeAbove ? above : below;
    const maxHeight = Math.max(96, Math.min(desiredHeight, availableHeight));
    const width = Math.min(
      Math.max(rect.width, 180),
      viewport.width - viewportMargin * 2
    );
    const left = Math.min(
      Math.max(viewportMargin, rect.left - viewport.left),
      viewport.width - width - viewportMargin
    );

    setMenuPosition({
      top: placeAbove ? rect.top - gap - maxHeight : rect.bottom + gap,
      left,
      width,
      maxHeight,
      origin: placeAbove ? "bottom" : "top",
    });
  }, [options.length]);

  useEffect(() => {
    if (!open) return;

    updateMenuPosition();

    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        closeMenu();
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePress);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition, closeMenu]);

  useEffect(() => {
    const menu = menuRef.current;
    if (!open || !menuPosition || !menu || menu.contains(document.activeElement)) return;
    // Positioning schedules another render. Focus only after the portal exists.
    optionRefs.current[Math.max(selectedIndex, 0)]?.focus();
  }, [open, menuPosition, selectedIndex]);

  const closeAndFocusTrigger = () => {
    closeMenu();
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const selectOption = (option: StyledSelectOption) => {
    onValueChange(option.value);
    closeAndFocusTrigger();
  };

  const moveFocus = (direction: 1 | -1) => {
    const currentIndex = optionRefs.current.findIndex(
      (option) => option === document.activeElement
    );
    const nextIndex =
      (Math.max(currentIndex, 0) + direction + options.length) % options.length;
    optionRefs.current[nextIndex]?.focus();
  };

  const menu =
    open && menuPosition && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            data-variant={variant}
            role="listbox"
            aria-labelledby={`${labelId} ${triggerId}`}
            className="styled-select-menu fixed z-[120] overflow-y-auto rounded-2xl border border-border bg-surface-light p-1.5 shadow-[0_18px_50px_rgba(39,31,22,0.22),0_1px_0_rgba(255,255,255,0.9)_inset]"
            style={{
              top: menuPosition.top,
              left: menuPosition.left,
              width: menuPosition.width,
              maxHeight: menuPosition.maxHeight,
              transformOrigin: menuPosition.origin,
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                moveFocus(1);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                moveFocus(-1);
              } else if (event.key === "Home") {
                event.preventDefault();
                optionRefs.current[0]?.focus();
              } else if (event.key === "End") {
                event.preventDefault();
                optionRefs.current[options.length - 1]?.focus();
              } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                closeAndFocusTrigger();
              } else if (event.key === "Tab") {
                // The portal sits at the end of the document. Resume the native
                // tab order from its trigger before unmounting the focused option.
                triggerRef.current?.focus();
                closeMenu();
              }
            }}
          >
            {options.map((option, index) => {
              const selected = option.value === value;

              return (
                <button
                  key={option.value}
                  ref={(element) => {
                    optionRefs.current[index] = element;
                  }}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => selectOption(option)}
                  className={`group flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left outline-none transition-colors ${
                    selected
                      ? "bg-phantom-soft text-text"
                      : "text-text hover:bg-bg focus-visible:bg-bg"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                      selected
                        ? "border-phantom bg-phantom text-white"
                        : "border-border bg-surface"
                    }`}
                  >
                    {selected && <Check weight="regular" size={12} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold">
                      {option.label}
                    </span>
                    {option.detail && (
                      <span className="mt-0.5 block truncate text-[10px] text-text-tertiary">
                        {option.detail}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>,
          document.body
        )
      : null;

  return (
    <div className="styled-select min-w-0" data-variant={variant}>
      <span
        id={labelId}
        className={variant === "quiet" ? "sr-only" : "mb-2 block text-[11px] font-semibold text-text-secondary"}
      >
        {label}
      </span>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-labelledby={`${labelId} ${triggerId}`}
        onClick={() => { if (open) closeMenu(); else setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            closeMenu();
          }
        }}
        className={`styled-select-trigger group flex w-full items-center gap-3 rounded-xl border border-border bg-surface text-left text-text shadow-[0_1px_0_rgba(255,255,255,0.9)_inset] outline-none transition-colors hover:border-text/30 disabled:cursor-not-allowed disabled:opacity-50 ${
          compact ? "h-11 px-3" : "min-h-12 px-3.5 py-2.5"
        }`}
      >
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate font-bold ${
              compact ? "text-[13px]" : "text-sm"
            }`}
          >
            {selectedOption?.label ?? placeholder}
          </span>
          {showSelectedDetail && selectedOption?.detail && (
            <span className="mt-0.5 block truncate text-[10px] text-text-tertiary">
              {selectedOption.detail}
            </span>
          )}
        </span>
        <span
          className={`shrink-0 text-text-tertiary transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          <CaretDown weight="regular" size={16} />
        </span>
      </button>
      {menu}
    </div>
  );
}
