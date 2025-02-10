/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { defineConfig } from "vitest/config";

import react from "@vitejs/plugin-react-swc";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    server: {
      deps: {
        // we must inline deps that have css or scss in them.
        // https://github.com/vitest-dev/vitest/issues/5283#issuecomment-1962265873
        inline: ["@itwin/presentation-components", "@itwin/components-react", "@itwin/core-react"],
      },
    },
  },
});
