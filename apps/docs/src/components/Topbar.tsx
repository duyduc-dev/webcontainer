import { shell } from '../styles';

const NAV_LINKS = ['architecture', 'capabilities', 'verified', 'quickstart', 'status'];

function Topbar() {
  return (
    <div className="border-b border-[var(--color-border)] py-[18px]">
      <div className={`${shell} flex items-center justify-between`}>
        <div className="flex items-center gap-2.5 font-mono text-[15px] font-bold">
          <span className="h-[9px] w-[9px] bg-[var(--color-accent)]" />
          duck-webcontainer-api
          <span className="font-normal text-[var(--color-text-faint)]">&nbsp;/ @dwc/core</span>
        </div>
        <nav className="flex gap-[22px] font-mono text-[13px] text-[var(--color-text-dim)]">
          {NAV_LINKS.map((link) => (
            <a className="hover:text-[var(--color-accent2)]" href={`#${link}`} key={link}>
              {link}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}

export default Topbar;
