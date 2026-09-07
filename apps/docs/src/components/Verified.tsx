import type { ReactNode } from 'react';
import { shell } from '../styles';
import SectionHead from './SectionHead';

interface LedgerRow {
  status: 'ok' | 'warn';
  statusLabel: string;
  what: ReactNode;
  num: string;
}

const LEDGER_ROWS: LedgerRow[] = [
  {
    status: 'ok',
    statusLabel: 'verified',
    what: (
      <>
        <code>npm install &lt;pkg&gt;</code> — real registry, real tarball extraction, real sha512 checks
      </>
    ),
    num: 'exit 0',
  },
  {
    status: 'ok',
    statusLabel: 'verified',
    what: (
      <>
        Real ESM: native <code>import()</code>, live bindings, top-level await
      </>
    ),
    num: 'esmLoader.ts',
  },
  {
    status: 'ok',
    statusLabel: 'verified',
    what: (
      <>
        Guest <code>http.createServer()</code> previewed live in an <code>&lt;iframe&gt;</code>
      </>
    ),
    num: 'Playwright',
  },
  {
    status: 'ok',
    statusLabel: 'verified',
    what: (
      <>
        Synchronous <code>child_process.execFileSync</code> — a real Atomics bridge
      </>
    ),
    num: 'exit 0',
  },
  {
    status: 'ok',
    statusLabel: 'verified',
    what: (
      <>
        A real npm-registry install completed entirely through that sync bridge + a <code>pnpm</code> shim
      </>
    ),
    num: 'on disk',
  },
  {
    status: 'warn',
    statusLabel: 'in progress',
    what: (
      <>
        Real Vite's own bundler (rolldown) — needs <code>node:wasi</code> to load its WASM binding
      </>
    ),
    num: 'next',
  },
];

function Verified() {
  return (
    <section id="verified" className="border-t border-[var(--color-border)] py-[52px]">
      <div className={shell}>
        <SectionHead eyebrowText="Verified live, not assumed" title="The ledger.">
          Every entry below was confirmed by actually running the real package inside the sandbox and reading the
          real result — the method this project has used for every gap, all the way through.
        </SectionHead>
        <div className="border border-[var(--color-border)] bg-[var(--color-surface)] font-sans">
          {LEDGER_ROWS.map((row, i) => (
            <div
              className={`grid grid-cols-[120px_1fr_auto] items-baseline gap-4 px-5 py-3.5 text-sm max-[700px]:grid-cols-1 max-[700px]:gap-1 ${i > 0 ? 'border-t border-[var(--color-border)]' : ''}`}
              key={i}
            >
              <span
                className={`w-max px-2 py-0.5 font-mono text-[11px] font-bold tracking-[0.06em] ${
                  row.status === 'ok'
                    ? 'bg-[var(--color-ok-bg)] text-[var(--color-ok)]'
                    : 'bg-[var(--color-warn-bg)] text-[var(--color-warn)]'
                }`}
              >
                {row.statusLabel}
              </span>
              <span className="[&_code]:border [&_code]:border-[var(--color-border)] [&_code]:bg-[var(--color-surface-2)] [&_code]:px-[5px] [&_code]:py-px [&_code]:text-[12.5px]">
                {row.what}
              </span>
              <span className="justify-self-end font-mono text-[12.5px] text-[var(--color-text-faint)] max-[700px]:justify-self-start">
                {row.num}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Verified;
