function StatusList({ items, tone }: { items: string[]; tone: 'ok' | 'warn' }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item, i) => (
        <li className="flex gap-2.5 text-sm text-[var(--color-text-dim)]" key={i}>
          <span
            className={`shrink-0 font-mono ${tone === 'ok' ? 'text-[var(--color-ok)]' : 'text-[var(--color-warn)]'}`}
          >
            {tone === 'ok' ? '✓' : '–'}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default StatusList;
