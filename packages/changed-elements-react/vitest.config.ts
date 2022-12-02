/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { defineConfig } from "vitest/config";

import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Workaround for https://github.com/iTwin/iTwinUI-react/issues/727
    alias: { "@itwin/itwinui-react": "@itwin/itwinui-react/esm" },
  },
  test: {
    environment: "happy-dom",
    coverage: {
      statements: 99.73,
      branches: 100,
      functions: 95.55,
      lines: 99.73,
    },
  },
});
