import { shell } from '../styles';
import SectionHead from './SectionHead';
import StatusList from './StatusList';

function Status() {
  return (
    <section id="status" className="border-t border-[var(--color-border)] py-[52px]">
      <div className={shell}>
        <SectionHead eyebrowText="Status" title="Pre-1.0, actively built in the open.">
          Everything here is what's actually true today, not a roadmap dressed up as a feature list.
        </SectionHead>
        <div className="grid grid-cols-2 gap-px border border-[var(--color-border)] bg-[var(--color-border)] max-md:grid-cols-1">
          <div className="bg-[var(--color-surface)] px-[22px] py-5">
            <h3 className="mb-3.5 font-mono text-[13px] tracking-[0.03em]">Works today</h3>
            <StatusList
              tone="ok"
              items={[
                'Real npm install against the live registry, including npm itself',
                'Real CJS + native ESM module loading, live bindings',
                '32 real Node builtins behind require()',
                'Guest HTTP servers, previewed live in an iframe',
                'A synchronous SharedArrayBuffer bridge for fs.*Sync and execFileSync',
              ]}
            />
          </div>
          <div className="bg-[var(--color-surface)] px-[22px] py-5">
            <h3 className="mb-3.5 font-mono text-[13px] tracking-[0.03em]">Known gaps</h3>
            <StatusList
              tone="warn"
              items={[
                'No native binary execution — no esbuild/native addons, no wasi yet',
                'Guest HTTP responses are fully buffered, text-only',
                "No HMR — WebSocket upgrades aren't interceptable by a Service Worker",
                "dwc.shell.exec() doesn't expose a real exit code",
              ]}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export default Status;
