import type { ReactNode } from 'react';

function CodeBlock({ children }: { children: ReactNode }) {
  return (
    <pre className="my-4 overflow-x-auto border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4 font-mono text-[13px] leading-[1.7] text-[var(--color-text)]">
      {children}
    </pre>
  );
}

export default CodeBlock;
