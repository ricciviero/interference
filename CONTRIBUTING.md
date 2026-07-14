# Contributing to interference

Thanks for contributing. This repository is public: you do not need to join a GitHub team or receive
write access to propose a change.

## External contributors

1. Fork `ricciviero/interference` on GitHub.
2. Clone your fork and create a focused branch.
3. Make the change and run the relevant checks:

   ```bash
   bun run typecheck
   bun test ./src
   ```

4. Push the branch to your fork and open a Pull Request to this repository's `main` branch.
5. Address CI failures and review comments. A maintainer merges the Pull Request after the required
   `test` check passes and all conversations are resolved.

Do not commit secrets, API keys, generated local state, or files that are already ignored by the
repository.

## Maintainers

- Work daily on `dev` or a focused branch, then open a Pull Request to `main`.
- Do not push directly to `main`: the branch is protected for everyone, including administrators.
- The `test` GitHub Actions check must pass and all Pull Request conversations must be resolved.
- No approving review is required while the project has one maintainer; this does not bypass the
  Pull Request or CI requirements.
- Force-pushes and deletion of `main` are disabled. GitHub's automatic deletion of merged branches
  is intentionally disabled.

## Releases

Prepare a release in a `release/vX.Y.Z` branch from current `dev`. Update `CHANGELOG.md`, then run
`npm --no-git-tag-version version <patch|minor|major>` so the version change is reviewed in a Pull
Request. After that PR has been merged into `main`, create and push the annotated `vX.Y.Z` tag from
that merged commit. Never push a release tag before the release PR is merged.

`npm publish` remains a manual maintainer action with OTP. See the release section in
[README.md](README.md#releasing-maintainers).
