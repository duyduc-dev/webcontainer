import type { ReactNode } from 'react';
import { eyebrow } from '../styles';

function SectionHead({ eyebrowText, title, children }: { eyebrowText: string; title: string; children: ReactNode }) {
  return (
    <div className="mb-[30px]">
      <div className={eyebrow}>{eyebrowText}</div>
      <h2 className="mt-3 text-wrap-balance font-mono text-[26px] font-bold">{title}</h2>
      <p className="mt-3 max-w-[62ch] text-[var(--color-text-dim)]">{children}</p>
    </div>
  );
}

export default SectionHead;
