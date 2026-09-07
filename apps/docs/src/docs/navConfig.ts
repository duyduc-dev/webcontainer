interface DocLink {
  label: string;
  to: string;
}

interface DocSection {
  title: string;
  links: DocLink[];
}

export const DOCS_NAV: DocSection[] = [
  {
    title: 'Getting started',
    links: [
      { label: 'Introduction', to: '/docs' },
      { label: 'Installation', to: '/docs/installation' },
      { label: 'Playground', to: '/docs/playground' },
    ],
  },
  {
    title: 'API',
    links: [
      { label: 'Filesystem', to: '/docs/filesystem' },
      { label: 'Process', to: '/docs/process' },
      { label: 'Shell', to: '/docs/shell' },
      { label: 'Preview', to: '/docs/preview' },
    ],
  },
  {
    title: 'Concepts',
    links: [
      { label: 'Node builtins', to: '/docs/node-builtins' },
      { label: 'Cross-origin isolation', to: '/docs/cross-origin-isolation' },
    ],
  },
  {
    title: 'Reference',
    links: [{ label: 'Status', to: '/docs/status' }],
  },
];
