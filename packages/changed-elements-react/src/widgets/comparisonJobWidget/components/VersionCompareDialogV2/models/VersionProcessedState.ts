/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/**
 * Give state of named version.
 * Helps with finding data seeding and processing state of named version.
*/
export enum VersionProcessedState {
  Verifying,
  Processed,
  Processing,
  Unavailable,
}
