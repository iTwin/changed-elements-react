# iTwin Changed Elements

[![CI](https://github.com/iTwin/changed-elements-react/actions/workflows/CI.yaml/badge.svg)](https://github.com/iTwin/changed-elements-react/actions/workflows/CI.yaml) [![CodeQL](https://github.com/iTwin/changed-elements-react/actions/workflows/codeql.yml/badge.svg)](https://github.com/iTwin/changed-elements-react/actions/workflows/codeql.yml)

## Packages

[@itwin/changed-elements-react](./packages/changed-elements-react/)

## Setup

```shell
pnpm install
```

## Commands

* `pnpm start` – starts the test app, available on [http://localhost:2363](http://localhost:2363)
  * To enable iTwin Platform features, create `packages/test-app-frontend/.env.local` file based on contents of `packages/test-app-frontend/.env`
* `pnpm test` – runs all unit tests
* `pnpm run cover` – runs all unit tests and calculates test coverage
* `pnpm run lint` – runs ESLint on all TypeScript files in this repository
* `pnpm run typecheck` – type checks all packages in this repository

## Contributing

### Issues

We welcome contributions to make this package better. You can submit feature requests or report bugs by creating an [issue](https://github.com/iTwin/changed-elements-react/issues).

### Versioning with Changesets

This repository uses [Changesets](https://github.com/changesets/changesets) to manage package versioning and changelogs. When making changes that affect the public API or behavior, please add a changeset by running:

```shell
npx changeset
```

Follow the prompts to describe your changes and select the appropriate version bump (major, minor, or patch). Versioning should follow [semver](https://semver.org/) conventions. If no version bump is required (such as for documentation-only changes), use `npx changeset --empty`.

When changesets are added and merged into the main branch, a release pull request (PR) will be automatically created by the Changesets GitHub Action. This PR will contain the version updates and changelog entries generated from your changesets. Review the release PR to ensure the version bumps and changelog messages are accurate before merging. Once the release PR is merged, the new package version will be published automatically.

For more details, see the [Changesets documentation](https://github.com/changesets/changesets/blob/main/README.md).

---

Copyright © Bentley Systems, Incorporated. All rights reserved. See [LICENSE.md](./LICENSE.md) for license terms and full copyright notice.
