/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./index.css";
import "@itwin/itwinui-layouts-css/styles.css";
import { render } from "react-dom";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App/App";

render(<BrowserRouter><App /></BrowserRouter>, document.getElementById("root") as HTMLElement);
