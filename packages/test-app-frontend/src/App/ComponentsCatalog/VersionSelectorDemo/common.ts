/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Changeset, NamedVersionListItem } from "@itwin/changed-elements-react";

export const changesets: Changeset[] = [
  {
    id: "e4131500",
    description: "Changeset of current named version",
    date: new Date("2023-06-05"),
    isProcessed: false,
  },
  {
    id: "1e14cacf",
    description: "Changeset 04",
    date: new Date("2023-06-04"),
    isProcessed: false,
  },
  {
    id: "9a7e7c41",
    description: "Changeset 03",
    date: new Date("2023-01-14"),
    isProcessed: false,
  },
  {
    id: "f7ca8408",
    description: "Changeset 02",
    date: new Date("2023-01-13"),
    isProcessed: false,
  },
  {
    id: "0798a90d",
    description: "Changeset 01",
    date: new Date("2023-01-12"),
    isProcessed: false,
  },
];

export const currentNamedVersion: NamedVersionListItem = {
  namedVersion: {
    id: "725ce9b5",
    changesetId: "e4131500",
    displayName: "Currently checked out version",
    description: "Currently checked out version will appear on the top of the list",
    date: "2023-10-02",
  },
  changesets: [changesets[0]],
};



export const namedVersionList: NamedVersionListItem[] = [
  {
    namedVersion: {
      id: "076f2621",
      changesetId: "1e14cacf",
      displayName: "Another named version",
      description: "Description of this named version goes here",
      date: "2023-09-08",
    },
    changesets: [changesets[1]],
  },
  {
    namedVersion: {
      id: "2d0dc9de",
      changesetId: "9a7e7c41",
      displayName: "First named version",
      description: "",
      date: "2023-01-14",
    },
    changesets: [changesets[2], changesets[3], changesets[4]],
  },
];
