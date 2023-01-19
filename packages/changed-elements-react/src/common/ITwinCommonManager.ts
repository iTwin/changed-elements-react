/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { getClassName, UiError } from "@itwin/appui-abstract";
import { ITwinLocalization } from "@itwin/core-i18n";

export class ITwinCommonManager {
  private static _i18n?: ITwinLocalization;

  public static async initialize(i18n: ITwinLocalization): Promise<void> {
    ITwinCommonManager._i18n = i18n;
    return ITwinCommonManager._i18n.registerNamespace(ITwinCommonManager.i18nNamespace);
  }

  public static terminate() {
    if (ITwinCommonManager._i18n) {
      ITwinCommonManager._i18n.unregisterNamespace(ITwinCommonManager.i18nNamespace);
    }
    ITwinCommonManager._i18n = undefined;
  }

  public static get i18n(): ITwinLocalization {
    if (!ITwinCommonManager._i18n) {
      throw new UiError(
        ITwinCommonManager.loggerCategory(this),
        "ITwinCommonManager not initialized",
      );
    }
    return ITwinCommonManager._i18n;
  }

  public static get i18nNamespace(): string {
    return "ITwinCommon";
  }

  public static get packageName(): string {
    return "itwin-common";
  }

  public static translate: typeof ITwinCommonManager.i18n.getLocalizedString = (
    key,
    options,
  ) => {
    return ITwinCommonManager.i18n.getLocalizedStringWithNamespace(
      ITwinCommonManager.i18nNamespace,
      key,
      options,
    );
  };

  public static loggerCategory(obj: unknown): string {
    const className = getClassName(obj);
    const category =
      ITwinCommonManager.packageName + (className ? `.${className}` : "");
    return category;
  }
}
