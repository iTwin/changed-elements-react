/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** Prepends URL hostname with urlPrefix. */
export function applyUrlPrefix(base: string, url = ""): string {
  const normalizedUrl = new URL(url, base);
  normalizedUrl.hostname = urlPrefix + normalizedUrl.hostname;
  return normalizedUrl.toString();
}

export const clientId = import.meta.env.VITE_CLIENT_ID;
export const urlPrefix = import.meta.env.VITE_URL_PREFIX;
