# docs

The public overview page for `duck-webcontainer-api` / `@dwc/core` — a
single static `index.html`, no build step. Deployed to GitHub Pages
automatically on push to `main` via `.github/workflows/deploy-docs.yml`.

```bash
pnpm --filter docs dev   # serves index.html at http://localhost:4321
```

To edit: change `index.html` directly and push — the workflow republishes
it. Keep the content grounded in what's actually true of the project (see
`PROGRESS.md` at the repo root) rather than aspirational copy.
