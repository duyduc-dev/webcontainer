import { NavLink, Outlet } from 'react-router';
import Footer from '../components/Footer';
import { DOCS_NAV } from './navConfig';

function DocsLayout() {
  return (
    <>
      <div className="mx-auto flex max-w-[1120px] items-start gap-12 px-7 py-10">
        <aside className="sticky top-10 hidden w-[200px] shrink-0 flex-col gap-6 md:flex">
          {DOCS_NAV.map((section) => (
            <div key={section.title}>
              <div className="mb-2 font-mono text-[11px] font-semibold tracking-[0.1em] text-[var(--color-text-faint)] uppercase">
                {section.title}
              </div>
              <nav className="flex flex-col gap-1.5">
                {section.links.map((link) => (
                  <NavLink
                    className={({ isActive }) =>
                      `text-[14px] ${
                        isActive
                          ? 'font-semibold text-[var(--color-accent2)]'
                          : 'text-[var(--color-text-dim)] hover:text-[var(--color-text)]'
                      }`
                    }
                    end={link.to === '/docs'}
                    key={link.to}
                    to={link.to}
                  >
                    {link.label}
                  </NavLink>
                ))}
              </nav>
            </div>
          ))}
        </aside>
        <main className="min-w-0 flex-1 py-2">
          <Outlet />
        </main>
      </div>
      <Footer />
    </>
  );
}

export default DocsLayout;
