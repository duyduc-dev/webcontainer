import type { ReactNode } from 'react';

function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="border border-[var(--color-border)] bg-[var(--color-surface-2)] px-[7px] py-[3px] font-mono text-[11.5px] text-[var(--color-text-dim)]">
      {children}
    </span>
  );
}

export default Tag;
