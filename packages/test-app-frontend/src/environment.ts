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

/**
 * Prepends URL hostname with urlPrefix.
 * dev will default to qa.
 * no url prefix will default to qa
 */
export function applyAuthUrlPrefix(base: string): string {
  let deploymentRegion = urlPrefix;
  if ((!!urlPrefix) || urlPrefix === "dev") {
    deploymentRegion = "qa-";
  }
  const normalizedUrl = new URL(base);
  normalizedUrl.hostname = deploymentRegion + normalizedUrl.hostname;
  return normalizedUrl.toString();
}

export const clientId = import.meta.env.VITE_CLIENT_ID;
export const urlPrefix = import.meta.env.VITE_URL_PREFIX;
