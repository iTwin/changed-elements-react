/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import react from "@vitejs/plugin-react-swc";
import { config } from "dotenv-flow";
import path from "path";
import { defineConfig, Plugin } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import tsconfigPaths from "vite-tsconfig-paths";

config();

// https://vitejs.dev/config/
export default defineConfig(() => ({
  plugins: [
    tsconfigPaths(),
    stringReplacePlugin(),
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
        find: /^~(.*)(?!\.scss)$/,
        replacement: path.resolve(__dirname, "./node_modules/$1.scss"),
      },
    ],
  },
  server: {
    port: Number.parseInt(process.env.VITE_FRONTEND_PORT ?? "", 10),
  },
}));

function stringReplacePlugin(): Plugin {
  return {
    name: stringReplacePlugin.name,
    enforce: "pre",
    transform: (code: string) => {
      // iTwin.js by default injects a font that is incorrect and lacks some required font weights
      return code.replace("document.head.prepend(openSans);", "// document.head.prepend(openSans);");
    },
  };
}
