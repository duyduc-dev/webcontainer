# Publishing `duckwc` to npm

Use this guide to release the public package in `packages/core`.

## Before publishing

Work from a clean `main` branch. Choose an unused SemVer version in
`packages/core/package.json`; use a minor version for breaking API changes and
a patch version for backwards-compatible fixes. Do not reuse a published npm
version.

Run the release checks from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm --filter duckwc test
pnpm build
cd packages/core && npm pack --dry-run
```

The dry run must contain only `README.md`, `package.json`, and the built
`dist/` files.

## Publish

Log in with an npm account that can publish `duckwc`. If the account requires
two-factor authentication, enter the current code from its authenticator app
locally; never share tokens or one-time codes in chat.

```bash
cd packages/core
npm publish --access public --otp=YOUR_2FA_CODE
npm view duckwc name version dist-tags --json
```

Commit the version and source changes, then push `main`. For future releases,
repeat the version bump and checks before publishing.
