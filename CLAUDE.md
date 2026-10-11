# Pinned Notes Menu: notes for Claude Code

An Obsidian plugin that combines Pinned Notes (vasilcoin002) and Ribbon Divider (andrewmcgivery), both MIT. The owner is the only user. Keep the plugin id `pinned-notes-menu`: changing it would orphan the installed plugin and its synced `data.json`.

## Workflow

- Push finished, checked work straight to `main`. No pull requests, no asking first.
- Every change that ships gets a new patch version (0.0.x) and a GitHub release:
  1. Bump the version in `manifest.json`, `package.json` and `package-lock.json` (the top-level `version` and `packages[""].version`), and add it to the top of `versions.json` mapped to `manifest.json`'s `minAppVersion`.
  2. Add a `## [x.y.z] - YYYY-MM-DD` entry at the top of `CHANGELOG.md`. The release workflow uses it as the release notes and fails without it.
  3. Commit and push to `main`, then publish the release with `.github/workflows/release.yml`. Either push the tag `x.y.z` (no `v` prefix), or, where tag pushes are blocked (cloud sessions), run the "Release Plugin" workflow on `main` with the input `version: x.y.z`.
  4. Tell the owner the version number. Don't give them git commands; they use the GitHub web interface.
- Never reuse a version number that was already tagged or released.

## Checks before pushing

```
npm run lint        # eslint + tsc
npm run lint:css
npm test
npm run build
```

## Things to know

- `src/items.ts` holds the data model and pure helpers (unit tested in `tests/`); it must not import `obsidian`.
- Ribbon icons are identified by Obsidian as `<plugin id>:<title>`, so `ribbonTitles` makes titles unique. Removing icons without a restart uses the undocumented `leftRibbon.removeRibbonAction`, guarded.
- UI strings must be in sentence case (Obsidian lint rules).
- Don't give subclasses of Obsidian classes members that may clash with undocumented internals; use a `pw` prefix.
- `npm install` needs `legacy-peer-deps` (set in `.npmrc`) because of a vitest peer-dependency resolution bug.
