# Contributing

1. Branch from `main` as `feat/short-description` or `fix/short-description`.
2. Run `npm install`, then `npm run lint`, `npm run format:check` and `npm test` before each commit. Setup is in [docs/setup.md](docs/setup.md).
3. Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `style:`, `perf:`, `test:`, `ci:`): an imperative subject of 72 characters or less with no version, e.g. `feat: add CSV export`, then one bullet per change.
4. Add a `node:test` test for every bug fix and every new function with logic.
5. Update the README with every change.

Versions follow SemVer and only change in a release commit. Questions or bigger ideas go in an issue first.

By contributing you agree your work is covered by the project's [LICENSE](LICENSE).
