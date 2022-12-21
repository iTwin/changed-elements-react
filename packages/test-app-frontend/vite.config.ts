/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as path from "path";
import { defineConfig, Plugin } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    stringReplacePlugin(),
    react(),
    viteStaticCopy({
      targets: [
        { src: "./node_modules/@itwin/appui-react/lib/public/locales", dest: "." },
        { src: "./node_modules/@itwin/changed-elements-react/public/locales", dest: "." },
        { src: "./node_modules/@itwin/components-react/lib/public/locales", dest: "." },
        { src: "./node_modules/@itwin/core-frontend/lib/public/locales", dest: "." },
        { src: "./node_modules/@itwin/core-react/lib/public/locales", dest: "." },
        { src: "./node_modules/@itwin/imodel-components-react/lib/public/locales", dest: "." },
        { src: "./node_modules/@itwin/presentation-common/lib/public/locales", dest: "." },
        { src: "./node_modules/@itwin/presentation-components/lib/public/locales", dest: "." },
      ],
    }),
  ],
  resolve: {
    alias: {
      "~@itwin/appui-layout-react": "@itwin/appui-layout-react",
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

function stringReplacePlugin(): Plugin {
  return {
    name: stringReplacePlugin.name,
    transform: (code) => {
      return code.replace(
        "var PRESENTATION_COMMON_ROOT = __dirname;",
        "var PRESENTATION_COMMON_ROOT = typeof __dirname !== 'undefined' ? __dirname : '__dirname';",
      );
    },
  };
}
