import type { HTMLAttributes, ReactNode, Ref } from "react";

/**
 * The player's frame: a picture, the title over it, and whatever sits on top (transport, notices, toolbar).
 * Player puts a video in it. The welcome tour puts a still in it and runs the same toolbar from a script.
 */
export function PlayerStage({ ref, title, subtitle, idle = false, crowded = false, picture, children, ...pointer }: {
  ref?: Ref<HTMLDivElement>;
  title: string;
  subtitle?: string;
  /** Nothing has moved for a while: the toolbar and title step back from the picture. */
  idle?: boolean;
  /** Something holds the top right corner, so the title ends before it. */
  crowded?: boolean;
  picture: ReactNode;
  children: ReactNode;
} & Pick<HTMLAttributes<HTMLDivElement>, "onMouseMove" | "onTouchStart" | "onMouseLeave">) {
  return (
    <div className="stage-frame still-stage-frame">
      <div ref={ref} className={`stage w-full ${idle ? "stage-idle" : ""}`}
        tabIndex={0} role="region" aria-label={`${title} player`} {...pointer}>
        {picture}
        <div className="stage-top">
          <div className={`min-w-0 flex-1 ${crowded ? "pr-12" : ""}`}>
            <p className="truncate text-lg font-medium text-stage-text">{title}</p>
            {subtitle && <p className="mt-1 truncate text-[13px] text-stage-muted">{subtitle}</p>}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
