/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { StateManager, UiFramework, UiStateStorageHandler } from "@itwin/appui-react";
import { UiStateStorage, UiStateStorageResult, UiStateStorageStatus } from "@itwin/core-react";
import { PropsWithChildren, ReactElement, useEffect } from "react";
import { Provider } from "react-redux";

export function UIFramework(props: PropsWithChildren<unknown>): ReactElement {
  useEffect(
    () => {
      // We do not UI state to persist between sessions
      void UiFramework.setUiStateStorage(new MemoryUISettingsStorage(), true);
    },
    [],
  );

  return (
    <Provider store={StateManager.store}>
      <UiStateStorageHandler>
        {props.children}
      </UiStateStorageHandler>
    </Provider>
  );
}


/** UI settings storage that resets after page refresh. */
class MemoryUISettingsStorage implements UiStateStorage {
  private settings = new Map<string, Map<string, unknown>>();

  public async getSetting(settingNamespace: string, settingName: string): Promise<UiStateStorageResult> {
    const setting = this.settings.get(settingNamespace)?.get(settingName);
    return { status: setting !== undefined ? UiStateStorageStatus.Success : UiStateStorageStatus.NotFound, setting };
  }

  public async saveSetting(namespace: string, name: string, setting: unknown): Promise<UiStateStorageResult> {
    const scopedSettings = this.settings.get(namespace) ?? new Map<string, unknown>();
    scopedSettings.set(name, setting);
    this.settings.set(namespace, scopedSettings);
    return { status: UiStateStorageStatus.Success };
  }

  public async deleteSetting(settingNamespace: string, settingName: string): Promise<UiStateStorageResult> {
    const deleted = this.settings.get(settingNamespace)?.delete(settingName);
    return { status: deleted ? UiStateStorageStatus.Success : UiStateStorageStatus.NotFound };
  }
}
