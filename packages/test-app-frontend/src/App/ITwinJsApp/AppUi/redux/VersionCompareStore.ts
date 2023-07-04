/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { KeySet } from "@itwin/presentation-common";

import { type ActionsUnion, type DeepReadonly, createAction } from "./redux-ts.js";

export interface VersionCompareState {
  selection?: KeySet;
}

const initialState: VersionCompareState = {
  selection: undefined,
};

export enum VersionCompareActionTypes {
  SET_SELECTION_KEYS = "SET_SELECTION_KEYS",
}

export const VersionCompareActions = {
  setConnection: (selection: KeySet) => createAction(VersionCompareActionTypes.SET_SELECTION_KEYS, selection),
};

export type VersionCompareActionUnion = ActionsUnion<typeof VersionCompareActions>;

export function VersionCompareReducer(
  state: VersionCompareState = initialState,
  action: VersionCompareActionUnion,
): DeepReadonly<VersionCompareState> {
  switch (action.type) {
    case VersionCompareActionTypes.SET_SELECTION_KEYS:
      return { ...state, selection: action.payload };
    default:
      return state;
  }
}
