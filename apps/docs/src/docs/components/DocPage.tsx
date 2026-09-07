import type { ReactNode } from 'react';

function DocPage({
  title,
  lede,
  wide,
  children,
}: {
  title: string;
  lede?: ReactNode;
  /** Pages with wide content (the Playground's editor+preview grid) opt out
   * of the standard 720px prose measure. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <article className={wide ? 'max-w-[960px]' : 'max-w-[720px]'}>
      <h1 className="text-wrap-balance font-mono text-[28px] font-bold">{title}</h1>
      {lede && <p className="mt-3 text-[16px] text-[var(--color-text-dim)]">{lede}</p>}
      <div className="doc-body mt-6 flex flex-col gap-4 text-[15px] leading-[1.7] text-[var(--color-text)]">
        {children}
      </div>
    </article>
  );
}

export default DocPage;
