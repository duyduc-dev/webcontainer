import type { ReactNode } from 'react';

function DocPage({ title, lede, children }: { title: string; lede?: ReactNode; children: ReactNode }) {
  return (
    <article className="max-w-[720px]">
      <h1 className="text-wrap-balance font-mono text-[28px] font-bold">{title}</h1>
      {lede && <p className="mt-3 text-[16px] text-[var(--color-text-dim)]">{lede}</p>}
      <div className="doc-body mt-6 flex flex-col gap-4 text-[15px] leading-[1.7] text-[var(--color-text)]">
        {children}
      </div>
    </article>
  );
}

export default DocPage;
