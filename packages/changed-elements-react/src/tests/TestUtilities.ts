/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { DbOpcode } from "@itwin/core-bentley";
import { QueryBinder } from "@itwin/core-common";

import type { ChangedElementEntry } from "../api/ChangedElementEntryCache";

export const mockChangedElementEntries = (
  size: number,
  opcode: DbOpcode = DbOpcode.Update,
  loaded = false,
): ChangedElementEntry[] => {
  const entries: ChangedElementEntry[] = [];
  for (let i = 0; i < size; ++i) {
    const id: string = "0x" + i;
    entries.push(mockChangedElementEntry(id, opcode, loaded));
  }
  return entries;
};

export const mockChangedElementEntry = (
  id: string,
  opcode: DbOpcode = DbOpcode.Update,
  loaded = false,
): ChangedElementEntry => {
  return {
    id,
    classId: id + "c1a55",
    opcode,
    type: 0,
    loaded,
  };
};

/** Node to keep hierarchy information for testing purposes */
export interface ChangedElementEntryTestNode {
  entry: ChangedElementEntry;
  parent?: ChangedElementEntryTestNode;
  children?: ChangedElementEntryTestNode[];
}

/** Flatten to changed element entries */
export const flattenEntries = (nodes: ChangedElementEntryTestNode[]): ChangedElementEntry[] => {
  const elements: ChangedElementEntry[] = [];
  for (const node of nodes) {
    if (node.entry) {
      elements.push(node.entry);
    }

    if (node.children) {
      elements.push(...flattenEntries(node.children));
    }
  }
  return elements;
};

export const findNodeWithId = (
  nodes: ChangedElementEntryTestNode[],
  id: string,
): ChangedElementEntryTestNode | undefined => {
  for (const node of nodes) {
    if (node.entry.id === id) {
      return node;
    }

    if (node.children) {
      const found = findNodeWithId(node.children, id);
      if (found !== undefined) {
        return node;
      }
    }
  }
  return undefined;
};

/**
 * Interface for mocking query results
 */
export interface QueryStatementMocker {
  /** Query string that should match for the ECSQL when calling iModel query */
  queryMatch?: string;
  /** Function to populate the row object with whatever the matcher mocker wants */
  populateRow: (binding: unknown, row: unknown) => void;
}

/** Collection of mock functions for iModel internal functions */
export const iModelMocks = {
  queryReturnBindingFuncMockGenerator: (bindingPostfix = "") => {
    return async function* (_ecsql: string, params?: QueryBinder): AsyncIterableIterator<unknown> {
      const array: unknown[] = [];
      const bindings = params?.serialize();
      if (bindings) {
        for (const val of Object.values(bindings)) {
          if (val?.value) {
            array.push(val.value);
          }
        }
      } else {
        array.push("0xF00D");
      }
      for (const value of array) {
        yield JSON.stringify(value) + bindingPostfix;
      }
    };
  },

  /** Generates a query function that will return a customizable row based on the given QueryStatementMockers */
  queryMatcherFuncMockGenerator: (
    queryMockers: QueryStatementMocker[],
    addDefaultBinding?: boolean,
  ) => {
    return async function* (ecsql: string, params?: QueryBinder): AsyncIterableIterator<unknown> {
      const bindings = params?.serialize();
      const array: unknown[] = [];
      if (bindings) {
        for (const val of Object.values(bindings)) {
          if (val?.value) {
            array.push(val.value);
          }
        }
      } else if (addDefaultBinding) {
        array.push("0xF00D");
      }

      const validMockers: QueryStatementMocker[] = [];
      for (const mocker of queryMockers) {
        if (
          mocker.queryMatch === undefined ||
          ecsql.indexOf(mocker.queryMatch) !== -1
        ) {
          validMockers.push(mocker);
        }
      }

      for (const binding of array) {
        const row: unknown = {};
        for (const mocker of validMockers) {
          mocker.populateRow(binding, row);
        }
        yield row;
      }
    };
  },
};
