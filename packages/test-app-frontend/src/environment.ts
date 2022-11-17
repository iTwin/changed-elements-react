/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** Prepends URL hostname with urlPrefix. */
export function applyUrlPrefix(url: string): string {
  if (!urlPrefix) {
    return url;
  }

  const modifierUrl = new URL(url);
  modifierUrl.hostname = urlPrefix + modifierUrl.hostname;
  return modifierUrl.toString();
}

export const clientId = import.meta.env.VITE_CLIENT_ID;
export const urlPrefix = import.meta.env.VITE_URL_PREFIX;
