import { btn, btnPrimary, eyebrow, shell } from '../styles';
import TermLine from './TermLine';

function Hero() {
  return (
    <div className={`${shell} py-[68px] pb-14`}>
      <div className="grid grid-cols-[1.05fr_1fr] items-start gap-14 max-[880px]:grid-cols-1">
        <div>
          <div className={eyebrow}>Node.js sandbox, client-only</div>
          <h1 className="mt-3.5 mb-4 text-wrap-balance font-mono text-[clamp(32px,4.4vw,46px)] leading-[1.08] font-bold">
            A WebContainer<span className="text-[var(--color-accent)]">.</span>
            <br />
            in three Web Workers.
          </h1>
          <p className="mb-[26px] max-w-[46ch] text-[17px] text-[var(--color-text-dim)]">
            A virtual filesystem, a shell, real <code>node</code>/<code>npm</code> execution against the live
            registry, and live preview of servers started inside it — no backend, nothing installed on the host.
            Inspired by StackBlitz WebContainers; built as its own kernel/worker architecture from scratch.
          </p>
          <div className="flex flex-wrap gap-3">
            <a className={`${btn} ${btnPrimary}`} href="#quickstart">
              Read the quickstart
            </a>
            <a className={btn} href="#architecture">
              See the process table
            </a>
          </div>
        </div>
        <div className="border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_1px_0_var(--color-border),0_18px_40px_-24px_rgba(0,0,0,0.35)]">
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-2.5">
            <div className="flex gap-1.5">
              <span className="h-[9px] w-[9px] rounded-full bg-[var(--color-border-strong)]" />
              <span className="h-[9px] w-[9px] rounded-full bg-[var(--color-border-strong)]" />
              <span className="h-[9px] w-[9px] rounded-full bg-[var(--color-border-strong)]" />
            </div>
            <div className="ml-1.5 font-mono text-[11.5px] tracking-[0.02em] text-[var(--color-text-faint)]">
              boot transcript — real session output
            </div>
          </div>
          <div className="overflow-x-auto px-[18px] pt-4 pb-[18px] font-mono text-[12.8px] leading-[1.72] text-[var(--color-text-dim)]">
            <TermLine>
              <span className="text-[var(--color-text-faint)]">$</span>{' '}
              <span className="text-[var(--color-accent2)]">bootWC</span>()
              <span className="text-[var(--color-text-faint)]">  // no await needed</span>
            </TermLine>
            <TermLine>
              <span className="text-[var(--color-text-faint)]">[kernel]</span> worker online, syscall router armed
            </TermLine>
            <TermLine>
              <span className="text-[var(--color-text-faint)]">[fs]</span>&nbsp;&nbsp;&nbsp;&nbsp;worker online,
              in-memory VFS mounted
            </TermLine>
            <TermLine>
              <span className="text-[var(--color-text-faint)]">[kernel]</span>{' '}
              <span className="text-[var(--color-accent2)]">PING</span> →{' '}
              <span className="text-[var(--color-ok)]">PONG</span>{' '}
              <span className="text-[var(--color-text-faint)]">4ms</span>
            </TermLine>
            <TermLine>
              <span className="text-[var(--color-text-faint)]">[process]</span> spawn{' '}
              <span className="text-[var(--color-accent)]">/bin/npm.js</span> install vite
            </TermLine>
            <TermLine>
              <span className="text-[var(--color-text-faint)]">[net]</span>&nbsp;&nbsp;&nbsp; GET
              registry.npmjs.org/vite <span className="text-[var(--color-ok)]">200</span>
            </TermLine>
            <TermLine>
              added 13 packages in <span className="text-[var(--color-accent)]">23s</span>
            </TermLine>
            <TermLine>
              <span className="text-[var(--color-text-faint)]">[process]</span> exit code{' '}
              <span className="text-[var(--color-ok)]">0</span>
            </TermLine>
            <TermLine>&nbsp;</TermLine>
            <TermLine>
              <span className="text-[var(--color-text-faint)]">$</span>{' '}
              <span className="cursor-blink inline-block h-[13px] w-[7px] translate-y-[2px] bg-[var(--color-accent)]" />
            </TermLine>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Hero;
