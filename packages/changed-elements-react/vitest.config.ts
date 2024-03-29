/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { defineConfig } from "vitest/config";

import react from "@vitejs/plugin-react-swc";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Workaround for https://github.com/iTwin/iTwinUI-react/issues/727
    alias: {
      "@itwin/itwinui-react": "@itwin/itwinui-react/esm",
      "@itwin/appui-layout-react": "@itwin/appui-layout-react/lib/esm/appui-layout-react.js",
      "@itwin/components-react": "@itwin/components-react/lib/esm/components-react.js",
      "@itwin/core-react": "@itwin/core-react/lib/esm/core-react.js",
      "@itwin/presentation-components": "@itwin/presentation-components/lib/esm/presentation-components.js",
    },
  },
  test: {
    environment: "happy-dom",
  },
});
