# docs

The public overview page for `duck-webcontainer-api` / `@dwc/core` — React +
Vite + Tailwind CSS, one component per file under `src/components/`.
Deployed to GitHub Pages automatically on push to `main` (see
`.github/workflows/deploy-docs.yml`), at `duyduc-dev.github.io/webcontainer/`.

```bash
pnpm --filter docs dev      # http://localhost:5173/webcontainer/
pnpm --filter docs build    # -> apps/docs/dist
```

To edit: change the relevant component in `src/components/` (or shared
styles in `src/styles.ts`) and push — the workflow rebuilds and republishes
it. Keep the content grounded in what's actually true of the project (see
`PROGRESS.md` at the repo root) rather than aspirational copy.

`vite.config.ts` sets `base: '/webcontainer/'` because this deploys as a
GitHub Pages *project* page, not at the domain root — change it if the repo
is ever renamed or moved to a different Pages setup.
