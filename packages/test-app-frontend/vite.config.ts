/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as path from "path";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: "./node_modules/@itwin/changed-elements-react/public/locales", dest: "." },
        { src: "./node_modules/@itwin/core-frontend/lib/public/locales", dest: "." },
        { src: "./node_modules/@itwin/core-react/lib/public/locales", dest: "." },
      ],
    }),
  ],
  resolve: {
    alias: {
      "~@itwin/core-react": "@itwin/core-react",
      "~@itwin/itwinui-css": "@itwin/itwinui-css",
      "@itwin/changed-elements-react": "@itwin/changed-elements-react/index.ts",
      stream: path.resolve("./src/stubs/stream"),
    },
  },
  server: {
    port: 2363,
  },
});
