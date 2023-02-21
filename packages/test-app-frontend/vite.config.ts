/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import react from "@vitejs/plugin-react-swc";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
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
    alias: [
      {
        find: /^~(.*\/core-react\/)scrollbar$/,
        replacement: "node_modules/$1/_scrollbar.scss",
      },
      {
        find: /^~(.*\/core-react\/)typography$/,
        replacement: "node_modules/$1/_typography.scss",
      },
      {
        find: /^~(.*\/core-react\/)z-index$/,
        replacement: "node_modules/$1/_z-index.scss",
      },
      {
        find: /^~(.*\/core-react\/)geometry$/,
        replacement: "node_modules/$1/_geometry.scss",
      },
      {
        find: /^~(.*\/appui-layout-react\/.*\/)variables$/,
        replacement: "node_modules/$1/_variables.scss",
      },
      {
        find: /^~(.*\.scss)$/,
        replacement: "node_modules/$1",
      },
      {
        find: /^~(.*)(?!\.scss)$/,
        replacement: "node_modules/$1.scss",
      },
    ],
  },
  server: {
    port: 2363,
  },
});
