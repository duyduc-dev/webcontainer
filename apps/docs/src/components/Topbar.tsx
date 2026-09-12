import { Link, NavLink } from 'react-router';

function Topbar() {
  return (
    <div className="border-b border-[var(--color-border)] py-[18px]">
      <div className="mx-auto flex max-w-[1120px] items-center justify-between px-7">
        <Link className="flex items-center gap-2.5 font-mono text-[15px] font-bold" to="/">
          <span className="h-[9px] w-[9px] bg-[var(--color-accent)]" />
          duck-webcontainer-api
          <span className="font-normal text-[var(--color-text-faint)]">&nbsp;/ duckwc</span>
        </Link>
        <nav className="flex gap-[22px] font-mono text-[13px] text-[var(--color-text-dim)]">
          <NavLink
            className={({ isActive }) =>
              isActive ? 'text-[var(--color-accent2)]' : 'hover:text-[var(--color-accent2)]'
            }
            end
            to="/"
          >
            overview
          </NavLink>
          <NavLink
            className={({ isActive }) =>
              isActive ? 'text-[var(--color-accent2)]' : 'hover:text-[var(--color-accent2)]'
            }
            to="/docs"
          >
            docs
          </NavLink>
        </nav>
      </div>
    </div>
  );
}

export default Topbar;
