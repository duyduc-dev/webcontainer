import type { ReactNode } from 'react';
import { shell } from '../styles';
import SectionHead from './SectionHead';

interface ProcessRow {
  pid: string;
  name: string;
  desc: ReactNode;
  state: string;
}

const PROCESS_ROWS: ProcessRow[] = [
  {
    pid: 'worker.0',
    name: 'Kernel',
    desc: 'Routes host-page requests, owns the process table, relays cross-process networking, services the sync fs/exec bridges when cross-origin isolated.',
    state: 'running',
  },
  {
    pid: 'worker.1',
    name: 'FS',
    desc: 'In-memory virtual filesystem. Reachable async over postMessage, or synchronously via a SharedArrayBuffer + Atomics bridge from a guest process’s own thread.',
    state: 'running',
  },
  {
    pid: 'worker.N',
    name: 'Process',
    desc: (
      <>
        One per spawned guest program. A real CommonJS + native-ESM module loader, a Node-compatible event loop, and
        32 real Node builtins behind <code className="font-mono">require()</code>.
      </>
    ),
    state: 'per spawn',
  },
];

function Architecture() {
  return (
    <section id="architecture" className="border-t border-[var(--color-border)] py-[52px]">
      <div className={shell}>
        <SectionHead eyebrowText="Architecture" title="Three workers, one process table.">
          Everything runs inside the browser tab. The kernel never touches the network or disk directly — it routes;
          the FS and process workers do the actual work, each in its own thread.
        </SectionHead>
        <div className="flex flex-col border border-[var(--color-border)]">
          {PROCESS_ROWS.map((row, i) => (
            <div
              className={`grid grid-cols-[90px_200px_1fr_140px] items-baseline gap-[18px] px-5 py-[18px] max-[760px]:grid-cols-1 max-[760px]:gap-1.5 max-[760px]:px-[18px] max-[760px]:py-4 ${i > 0 ? 'border-t border-[var(--color-border)]' : ''}`}
              key={row.pid}
            >
              <div className="font-mono text-[13px] text-[var(--color-text-faint)]">{row.pid}</div>
              <div className="font-mono text-[14.5px] font-semibold">{row.name}</div>
              <div className="text-[14.5px] text-[var(--color-text-dim)]">{row.desc}</div>
              <div className="justify-self-end self-center bg-[var(--color-ok-bg)] px-[9px] py-[3px] font-mono text-[11.5px] font-semibold tracking-[0.06em] text-[var(--color-ok)] max-[760px]:justify-self-start">
                {row.state}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Architecture;
