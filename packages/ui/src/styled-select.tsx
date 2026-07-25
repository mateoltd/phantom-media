"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";

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

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedOption = options[selectedIndex];

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
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
      window.innerWidth - viewportMargin * 2
    );
    const left = Math.min(
      Math.max(viewportMargin, rect.left),
      window.innerWidth - width - viewportMargin
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
    const focusFrame = window.requestAnimationFrame(() => {
      optionRefs.current[Math.max(selectedIndex, 0)]?.focus();
    });

    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePress);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, selectedIndex, updateMenuPosition]);

  const closeAndFocusTrigger = () => {
    setOpen(false);
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
                closeAndFocusTrigger();
              } else if (event.key === "Tab") {
                setOpen(false);
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
                    {selected && <IconCheck size={12} stroke={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold">
                      {option.label}
                    </span>
                    {option.detail && (
                      <span className="mt-0.5 block truncate font-mono text-[10px] text-text-tertiary">
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
    <div className="min-w-0">
      <span
        id={labelId}
        className="mb-2 block font-mono text-[10px] font-bold uppercase text-text-tertiary"
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
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            setOpen(false);
          }
        }}
        className={`group flex w-full items-center gap-3 rounded-xl border border-border bg-surface text-left text-text shadow-[0_1px_0_rgba(255,255,255,0.9)_inset] outline-none transition-colors hover:border-text/30 disabled:cursor-not-allowed disabled:opacity-50 ${
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
            <span className="mt-0.5 block truncate font-mono text-[10px] text-text-tertiary">
              {selectedOption.detail}
            </span>
          )}
        </span>
        <span
          className={`shrink-0 text-text-tertiary transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          <IconChevronDown size={16} stroke={2} />
        </span>
      </button>
      {menu}
    </div>
  );
}
