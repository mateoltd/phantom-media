import styles from "./StillLoader.module.css";

/** Indeterminate activity: a breathing Still mark and a continuous trail of Zs. */
export function StillLoader({ label = "Loading…", variant = "default" }: {
  label?: string;
  variant?: "default" | "compact" | "page";
}) {
  return <span className={styles.loader} data-variant={variant} role="status">
    <svg className={styles.scene} viewBox="0 0 120 96" fill="none" aria-hidden="true" focusable="false">
      <g className={styles.face}>
        <path transform="translate(22 26)" fill="currentColor" fillRule="evenodd"
          d="M26 10h12a22 22 0 0 1 0 44H26a22 22 0 0 1 0-44ZM17 31a1 1 0 0 0 0 2h10a1 1 0 0 0 0-2H17ZM37 31a1 1 0 0 0 0 2h10a1 1 0 0 0 0-2H37Z" />
      </g>
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path className={styles.dream} d="M0 0h7L0 7h7" />
        <path className={styles.dream} d="M0 0h7L0 7h7" />
        <path className={styles.dream} d="M0 0h7L0 7h7" />
      </g>
    </svg>
    <span className={styles.label}>{label}</span>
  </span>;
}
