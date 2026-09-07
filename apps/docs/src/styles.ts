// Shared className fragments used by more than one component - kept here,
// not duplicated, so the palette/spacing stays a single source of truth.
export const shell = 'mx-auto max-w-[1120px] px-7';

export const eyebrow =
  "flex items-center gap-2.5 font-mono text-[12.5px] font-semibold uppercase tracking-[0.14em] text-[var(--color-accent)] before:content-[''] before:inline-block before:h-[7px] before:w-[7px] before:bg-[var(--color-accent)]";

export const btn =
  'inline-flex items-center gap-2 border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-[18px] py-[11px] font-mono text-[13px] font-semibold text-[var(--color-text)] no-underline';

export const btnPrimary = 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-ink)]';
