import type { ReactNode } from 'react';

function TermLine({ children }: { children: ReactNode }) {
  return <div className="whitespace-pre">{children}</div>;
}

export default TermLine;
