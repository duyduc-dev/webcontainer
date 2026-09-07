import { shell } from '../styles';
import SectionHead from './SectionHead';

function Quickstart() {
  return (
    <section id="quickstart" className="border-t border-[var(--color-border)] py-[52px]">
      <div className={shell}>
        <SectionHead eyebrowText="Quickstart" title="No await, no backend.">
          <code>bootDWC()</code> returns real, usable handles immediately — every call queues behind the kernel's
          boot handshake on its own.
        </SectionHead>
        <div className="overflow-x-auto border border-[var(--color-border)] bg-[var(--color-surface)] px-[22px] py-5 font-mono text-[13px] leading-[1.75]">
          <div>
            <span className="text-[var(--color-text-faint)]">import</span> {'{'}{' '}
            <span className="text-[var(--color-accent2)]">bootDWC</span> {'}'}{' '}
            <span className="text-[var(--color-text-faint)]">from</span>{' '}
            <span className="text-[var(--color-accent)]">"@dwc/core"</span>;
          </div>
          <div>&nbsp;</div>
          <div>
            <span className="text-[var(--color-text-faint)]">const</span> dwc ={' '}
            <span className="text-[var(--color-accent2)]">bootDWC</span>();{' '}
            <span className="text-[var(--color-text-faint)]">// synchronous</span>
          </div>
          <div>&nbsp;</div>
          <div>
            <span className="text-[var(--color-text-faint)]">await</span> dwc.fs.
            <span className="text-[var(--color-accent2)]">mkdir</span>(
            <span className="text-[var(--color-accent)]">"/project"</span>, {'{'} recursive: <span>true</span> {'}'}
            );
          </div>
          <div>
            <span className="text-[var(--color-text-faint)]">await</span> dwc.fs.
            <span className="text-[var(--color-accent2)]">writeFile</span>(
            <span className="text-[var(--color-accent)]">"/project/server.js"</span>, source);
          </div>
          <div>&nbsp;</div>
          <div>
            <span className="text-[var(--color-text-faint)]">const</span> proc ={' '}
            <span className="text-[var(--color-text-faint)]">await</span> dwc.process.
            <span className="text-[var(--color-accent2)]">spawn</span>(
            <span className="text-[var(--color-accent)]">"/project/server.js"</span>);
          </div>
          <div>
            dwc.<span className="text-[var(--color-accent2)]">addEventListener</span>(
            <span className="text-[var(--color-accent)]">"listen"</span>, ({'{'} port {'}'}) =&gt; {'{'}
          </div>
          <div>
            &nbsp;&nbsp;iframe.src = dwc.preview.<span className="text-[var(--color-accent2)]">url</span>(port);{' '}
            <span className="text-[var(--color-text-faint)]">// live preview</span>
          </div>
          <div>{'}'});</div>
        </div>
      </div>
    </section>
  );
}

export default Quickstart;
