/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IModelConnection } from "@itwin/core-frontend";
import { createStorage, type SelectionStorage } from "@itwin/unified-selection";

let unifiedSelectionStorage: SelectionStorage;

/**
 * Tree components that support selection synchronization, require a unified selection storage object created using createStorage() function from @itwin/unified-selection package.
 * @returns Unified selection storage object
 */
export function getUnifiedSelectionStorage(): SelectionStorage {
  if (!unifiedSelectionStorage) {
    unifiedSelectionStorage = createStorage();
    IModelConnection.onClose.addListener((imodel) => {
      unifiedSelectionStorage?.clearStorage({ imodelKey: imodel.key });
    });
  }

  return unifiedSelectionStorage;
}
