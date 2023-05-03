/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import react from "@vitejs/plugin-react-swc";
import * as path from "path";
import { defineConfig, Plugin } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  plugins: [
    new StringReplacePlugin(),
    react(),
    viteStaticCopy({
      targets: [
        { src: "./node_modules/@itwin/appui-react/lib/public/locales", dest: "." },
        { src: "./node_modules/@itwin/changed-elements-react/public/locales", dest: "." },
        { src: "./node_modules/@itwin/components-react/lib/public/locales", dest: "." },
        { src: "./node_modules/@itwin/core-frontend/lib/public/**", dest: "." },
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
        find: "@itwin/changed-elements-react",
        replacement: path.resolve(__dirname, "../changed-elements-react/src/index.ts"),
      },
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
}));

class StringReplacePlugin implements Plugin {
  public name = StringReplacePlugin.name;
  public enforce = "pre" as const;

  public transform = (code: string): string => {
    return code.replace(
      /const { AzureFrontendStorage, FrontendBlockBlobClientWrapperFactory } = await import\((.+?)\);/s,
      `
      const objectStorage = await import($1);
      const { AzureFrontendStorage, FrontendBlockBlobClientWrapperFactory } = objectStorage.default ?? objectStorage;
      `,
    );
  };
}
