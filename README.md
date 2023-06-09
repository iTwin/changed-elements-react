# iTwin Changed Elements

[![CI](https://github.com/iTwin/changed-elements-react/actions/workflows/CI.yaml/badge.svg)](https://github.com/iTwin/changed-elements-react/actions/workflows/CI.yaml) [![CodeQL](https://github.com/iTwin/changed-elements-react/actions/workflows/codeql.yml/badge.svg)](https://github.com/iTwin/changed-elements-react/actions/workflows/codeql.yml)

## Packages

[@itwin/changed-elements-react](./packages/changed-elements-react/)

## Setup

```bash
npx pnpm install
```

## Commands

* `npm start` – starts the test app, available on http://localhost:2363
  * To enable iTwin Platform features, create `packages/test-app-frontend/.env.local` file based on contents of `packages/test-app-frontend/.env`
* `npm test` – runs all unit tests
* `npm run cover` – runs all unit tests and calculates test coverage
* `npm run lint` – runs ESLint on all TypeScript files in this repository
* `npm run typecheck` – type checks all packages in this repository

## Contributing

We welcome contributions to make this project better. You can submit feature requests or report bugs by creating an [issue](https://github.com/iTwin/changed-elements-react/issues).

---

Copyright © Bentley Systems, Incorporated. All rights reserved. See [LICENSE.md](./LICENSE.md) for license terms and full copyright notice.
