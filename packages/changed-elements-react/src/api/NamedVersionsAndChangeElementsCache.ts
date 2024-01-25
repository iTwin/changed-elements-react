import { NamedVersion } from '../clients/iModelsClient';

type ChangeSetId = string;

export class NamedVersionCache {
  private static cache: Map<ChangeSetId, NamedVersion>;
  private static cacheClearId: NodeJS.Timer;
  private static NamedVersionsAndChangeElementsCache: NamedVersionCache;
  private constructor() {
    if (!NamedVersionCache.cache && !NamedVersionCache.cacheClearId && !NamedVersionCache.NamedVersionsAndChangeElementsCache) {
      const timeInMilliseconds = 300000; // five minutes
      NamedVersionCache.cache = new Map<ChangeSetId, NamedVersion>;
      NamedVersionCache.cacheClearId = setInterval(NamedVersionCache.clearCache, timeInMilliseconds);
    }
  }

  public static addNamedVersionsAndChangeElements(changeSetId: ChangeSetId, namedVersion: NamedVersion) {
    NamedVersionCache.cache.set(changeSetId,namedVersion)
  }

  public static getNamedVersion(changeSetId: ChangeSetId) {
  return NamedVersionCache.cache.get(changeSetId)
  }

  public static initializeNamedVersionsAndChangeElementsCache(): NamedVersionCache {
    if (!NamedVersionCache.NamedVersionsAndChangeElementsCache) {
      return new NamedVersionCache();
    }
    return NamedVersionCache.NamedVersionsAndChangeElementsCache;
  }

  private static clearCache(): void {
    NamedVersionCache.cache.clear();
  }
}
