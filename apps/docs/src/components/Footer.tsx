import { shell } from '../styles';

function Footer() {
  return (
    <footer className="border-t border-[var(--color-border)] py-[30px] pb-11">
      <div className={`${shell} flex flex-wrap items-center justify-between gap-3`}>
        <div className="flex items-center gap-2.5 font-mono text-[13px] font-bold">
          <span className="h-[9px] w-[9px] bg-[var(--color-accent)]" />
          duck-webcontainer-api
        </div>
        <div className="font-mono text-xs text-[var(--color-text-faint)]">
          packages/core · pnpm workspace · MIT-shaped, license file pending
        </div>
      </div>
    </footer>
  );
}

export default Footer;
