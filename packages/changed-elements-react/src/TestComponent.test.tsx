/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { TestComponent } from "./TestComponent";

describe("TestComponent", () => {
  it("Renders text", () => {
    const { queryByText } = render(<TestComponent />);
    expect(queryByText("Test")).not.toBeNull();
  });
});
