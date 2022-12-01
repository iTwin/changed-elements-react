/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmptyLocalization } from "@itwin/core-common";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { VersionSelectDialog } from "./VersionSelectDialog";

describe("VersionSelectDialog", () => {
  afterEach(() => {
    cleanup();
  });

  it("redners", () => {
    const handleOk = vi.fn();
    const {getByText} = render(
      <VersionSelectDialog
        localization={new EmptyLocalization()}
        iTwinId=""
        iModelId=""
        changesetId="Changeset1"
        changesets={["Changeset1", "Changeset0"]}
        changesetStatus={[{ id: "Changeset0", index: 0, ready: true }, { id: "Changeset1", index: 1, ready: true }]}
        namedVersions={[
          { changesetId: "Changeset0", name: "Changeset0", description: undefined, createdDateTime: undefined },
          { changesetId: "Changeset1", name: "Changeset1", description: undefined, createdDateTime: undefined },
        ]}
        onOk={handleOk}
        onCancel={() => { }}
      />,
    );

    fireEvent.click(getByText("Changeset0"));
    fireEvent.click(getByText("VersionCompare:versionCompare.compare"))
    expect(handleOk).toHaveBeenCalledOnce();
  });
});
