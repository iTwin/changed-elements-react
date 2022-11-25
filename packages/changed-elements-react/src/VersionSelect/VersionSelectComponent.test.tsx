/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmptyLocalization } from "@itwin/core-common";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { NamedVersion, VersionSelectComponent } from "./VersionSelectComponent";

describe("VersionSelectComponent", () => {
  const localization = new EmptyLocalization();

  afterEach(() => {
    cleanup();
  });

  it("throws when supplied changesetId does not exist", () => {
    expect(() => render(
      <VersionSelectComponent
        localization={localization}
        changesetId="0"
        changesetStatus={[]}
        changesets={[]}
        namedVersions={[]}
      />,
    )).toThrow();
  });

  it("throws when named version references changeset that does not exist", () => {
    expect(() => render(
      <VersionSelectComponent
        localization={localization}
        changesetId="0"
        changesetStatus={[]}
        changesets={["0"]}
        namedVersions={[createNamedVersion("0"), createNamedVersion("1")]}
      />,
    )).toThrow();
  });

  it("renders no named versions state when there is only one changeset", () => {
    const { queryByText } = render(
      <VersionSelectComponent
        localization={localization}
        changesetId="0"
        changesetStatus={[]}
        changesets={["0"]}
        namedVersions={[]}
      />,
    );
    expect(queryByText("VersionCompare:versionCompare.noNamedVersions")).not.toBeNull();
  });

  it("renders no named versions state when there are no past named versions", () => {
    const { queryByText } = render(
      <VersionSelectComponent
        localization={localization}
        changesetId="0"
        changesetStatus={[]}
        changesets={["1", "0"]}
        namedVersions={[createNamedVersion("0"), createNamedVersion("1")]}
      />,
    );
    expect(queryByText("VersionCompare:versionCompare.noNamedVersions")).not.toBeNull();
  });

  it("inserts default description text when it is not supplied", () => {
    const onVersionSelected = vi.fn();
    const { queryByText } = render(
      <VersionSelectComponent
        localization={localization}
        changesetId="InitialChangeset"
        changesetStatus={[
          { id: "InitialChangeset", index: 0, ready: true },
        ]}
        changesets={["InitialChangeset"]}
        namedVersions={[{
          changesetId: "InitialChangeset",
          name: "InitialChangeset",
          description: undefined,
          createdDateTime: undefined,
        }]}
        onVersionSelected={onVersionSelected}
      />,
    );
    expect(queryByText("VersionCompare:versionCompare.noDescription")).not.toBeNull;
  });

  describe("when changesets are not ready", () => {
    it("disallows selecting version", () => {
      const onVersionSelected = vi.fn();
      const { getByText } = render(
        <VersionSelectComponent
          localization={localization}
          changesetId="ModifiedChangeset"
          changesetStatus={[
            { id: "InitialChangeset", index: 0, ready: true },
            { id: "ModifiedChangeset", index: 1, ready: false },
          ]}
          changesets={["ModifiedChangeset", "InitialChangeset"]}
          namedVersions={[createNamedVersion("InitialChangeset"), createNamedVersion("ModifiedChangeset")]}
          onVersionSelected={onVersionSelected}
        />,
      );
      fireEvent.click(getByText("InitialChangeset"));
      expect(onVersionSelected).not.toHaveBeenCalled();
    });

    it("shows progress indicator", () => {
      const { container, queryByText } = render(
        <VersionSelectComponent
          localization={localization}
          changesetId="Changeset3"
          changesetStatus={[
            { id: "Changeset0", index: 0, ready: true },
            { id: "Changeset1", index: 1, ready: true },
            { id: "Changeset2", index: 2, ready: false },
            { id: "Changeset3", index: 3, ready: true },
          ]}
          changesets={["Changeset3", "Changeset2", "Changeset1", "Changeset0"]}
          namedVersions={[createNamedVersion("Changeset0"), createNamedVersion("Changeset1"), createNamedVersion("Changeset3")]}
        />,
      );
      const loadingIndicator = within(container.querySelector(".itwin-changed-elements__vs-loading-percentage")!);
      expect(loadingIndicator.queryByText("50")).not.toBeNull();
      expect(queryByText("VersionCompare:versionCompare.waiting")).not.toBeNull();
    });
  });

  describe("when changesets are ready", () => {
    it("allows selecting version", () => {
      const onVersionSelected = vi.fn();
      const { getByText } = render(
        <VersionSelectComponent
          localization={localization}
          changesetId="ModifiedChangeset"
          changesetStatus={[
            { id: "InitialChangeset", index: 0, ready: true },
            { id: "ModifiedChangeset", index: 1, ready: true },
          ]}
          changesets={["ModifiedChangeset", "InitialChangeset"]}
          namedVersions={[createNamedVersion("InitialChangeset"), createNamedVersion("ModifiedChangeset")]}
          onVersionSelected={onVersionSelected}
        />,
      );
      fireEvent.click(getByText("InitialChangeset"));
      expect(onVersionSelected).toHaveBeenCalledOnce();
      expect(onVersionSelected).toHaveBeenLastCalledWith(
        expect.objectContaining({ changesetId: "ModifiedChangeset" }),
        expect.objectContaining({ changesetId: "InitialChangeset" }),
      );
    });
  });

  function createNamedVersion(id: string): NamedVersion {
    return {
      changesetId: id,
      name: id,
      description: "test_description",
      createdDateTime: new Date(0).toString(),
    };
  }
});
