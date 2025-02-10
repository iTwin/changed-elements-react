/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App/App.js";

import "@bentley/icons-generic-webfont/dist/bentley-icons-generic-webfont.css";
import "@itwin/itwinui-layouts-css/styles.css";
import "./index.css";

const container = document.getElementById("root") as HTMLElement;
const root = createRoot(container);
root.render(<BrowserRouter><App /></BrowserRouter>);
