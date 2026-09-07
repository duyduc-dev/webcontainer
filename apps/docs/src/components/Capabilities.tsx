import { shell } from '../styles';
import SectionHead from './SectionHead';
import Tag from './Tag';

const VENDORED = ['stream', 'buffer', 'events', 'http', 'https', 'http2', 'crypto', 'zlib', 'async_hooks'];
const HAND_WRITTEN = [
  'fs',
  'fs/promises',
  'path',
  'util',
  'os',
  'url',
  'querystring',
  'string_decoder',
  'module',
  'assert',
  'readline',
  'perf_hooks',
  'constants',
  'v8',
  'tty',
  'net',
  'dns',
  'tls',
  'timers/promises',
];
const PARTIAL = ['child_process', 'vm', 'worker_threads', 'wasi'];

function Capabilities() {
  return (
    <section id="capabilities" className="border-t border-[var(--color-border)] py-[52px]">
      <div className={shell}>
        <SectionHead eyebrowText="Inside require()" title="What a guest process can actually call.">
          Every module below is real, not stubbed — vendored Node source, or a hand-written implementation matched
          against real Node's own documented contract, verified against actual npm packages including npm itself.
        </SectionHead>
        <div className="grid grid-cols-3 gap-px border border-[var(--color-border)] bg-[var(--color-border)] max-[860px]:grid-cols-1">
          <div className="bg-[var(--color-surface)] px-[22px] pt-5 pb-[22px]">
            <h3 className="font-mono text-[13px] tracking-[0.03em]">Vendored, verbatim</h3>
            <span className="my-1.5 block font-mono text-[26px] font-bold text-[var(--color-accent)]">9</span>
            <div className="flex flex-wrap gap-1.5">
              {VENDORED.map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
            </div>
          </div>
          <div className="bg-[var(--color-surface)] px-[22px] pt-5 pb-[22px]">
            <h3 className="font-mono text-[13px] tracking-[0.03em]">Hand-written, spec-matched</h3>
            <span className="my-1.5 block font-mono text-[26px] font-bold text-[var(--color-accent)]">19</span>
            <div className="flex flex-wrap gap-1.5">
              {HAND_WRITTEN.map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
            </div>
          </div>
          <div className="bg-[var(--color-surface)] px-[22px] pt-5 pb-[22px]">
            <h3 className="font-mono text-[13px] tracking-[0.03em]">Partial, on purpose</h3>
            <span className="my-1.5 block font-mono text-[26px] font-bold text-[var(--color-accent)]">4</span>
            <div className="flex flex-wrap gap-1.5">
              {PARTIAL.map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
            </div>
            <p className="mt-3.5 text-[13px] leading-[1.55] text-[var(--color-text-faint)]">
              <code className="font-mono">execFileSync</code> is a real synchronous Atomics bridge;{' '}
              <code className="font-mono">spawnSync</code> isn't traced yet.{' '}
              <code className="font-mono">vm.runInThisContext</code> is real; isolated contexts aren't.{' '}
              <code className="font-mono">MessageChannel</code> is real; <code className="font-mono">new Worker()</code>{' '}
              throws on purpose rather than faking a nested sandbox. <code className="font-mono">wasi</code> isn't
              started — see Status.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Capabilities;
