/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/**
 * Prepends base with urlPrefix from env.
 * dev- will default to qa-{base}
 */
export function applyAuthUrlPrefix(base: string): string {
  let deploymentRegion = urlPrefix;
  if (deploymentRegion === "dev-") {
    deploymentRegion = "qa-";
  }
  const normalizedUrl = new URL(base);
  normalizedUrl.hostname = deploymentRegion + normalizedUrl.hostname;
  return normalizedUrl.toString();
}

/** Prepends URL hostname with urlPrefix. */
export function applyUrlPrefix(base: string, url = ""): string {
  const normalizedUrl = new URL(url, base);
  normalizedUrl.hostname = urlPrefix + normalizedUrl.hostname;
  return normalizedUrl.toString();
}

export const clientId: string = import.meta.env.VITE_CLIENT_ID;
export const urlPrefix: string = import.meta.env.VITE_URL_PREFIX;
export const runExperimental: boolean = import.meta.env.VITE_RUN_EXPERIMENTAL === "true";
export const usingLocalBackend: boolean = import.meta.env.VITE_USE_LOCAL_BACKEND === "true";
export const localBackendPort: number = Number.parseInt(import.meta.env.VITE_LOCAL_BACKEND_PORT, 10);
export const useDirectComparison: boolean = import.meta.env.VITE_USE_DIRECT_COMPARISON === "true";
