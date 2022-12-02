/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** Prepends URL hostname with urlPrefix. */
export function applyUrlPrefix(base: string, url = ""): string {
  const modifierUrl = new URL(url, base);
  modifierUrl.hostname = urlPrefix + modifierUrl.hostname;
  return modifierUrl.toString();
}

export const clientId = import.meta.env.VITE_CLIENT_ID;
export const urlPrefix = import.meta.env.VITE_URL_PREFIX;
