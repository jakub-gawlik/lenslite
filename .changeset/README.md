# Changesets

Every user-facing change ships with a changeset: run `npx changeset`, pick the
bump (patch / minor / major) and describe the change for the changelog. Commit
the generated Markdown file alongside the change.

On `main`, the Release workflow collects pending changesets into a
"Version Packages" pull request that bumps `package.json` and updates
`CHANGELOG.md`. Merging that PR publishes to npm with provenance and pushes
the `vX.Y.Z` git tag.
