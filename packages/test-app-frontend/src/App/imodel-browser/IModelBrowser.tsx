/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { type AuthorizationClient } from "@itwin/core-common";
import { FluidGrid, PageLayout } from "@itwin/itwinui-layouts-react";
import { Text, Tile } from "@itwin/itwinui-react";
import { type ReactElement, type ReactNode, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useAuthorization } from "../Authorization.js";
import { LoadingScreen } from "../common/LoadingScreen.js";
import { getIModelThumbnail, getITwinIModels, type GetITwinIModelsResult } from "../ITwinApi.js";

export function IModelBrowser(): ReactElement {
  const { iTwinId } = useParams<{ iTwinId: string; }>();
  const { authorizationClient } = useAuthorization();
  const [iModels, setiModels] = useState<GetITwinIModelsResult["iModels"]>();

  useEffect(
    () => {
      if (iTwinId === undefined || authorizationClient === undefined) {
        return;
      }

      let disposed = false;
      void (async () => {
        const result = await getITwinIModels({ iTwinId }, { authorizationClient });
        if (!disposed) {
          setiModels(result?.iModels);
        }
      })();

      return () => { disposed = true; };
    },
    [iTwinId, authorizationClient],
  );

  if (!iModels || !authorizationClient) {
    return <LoadingScreen>Loading content...</LoadingScreen>;
  }

  return (
    <PageLayout.Content padded>
      <FluidGrid>
        {iModels.map((iModel) => (
          <IModelTile
            key={iModel.id}
            iTwinId={iModel.iTwinId}
            iModelId={iModel.id}
            name={iModel.name}
            description={iModel.description ?? undefined}
            authorizationClient={authorizationClient}
          />
        ))}
      </FluidGrid>
    </PageLayout.Content>
  );
}

export interface IModelTileProps {
  iModelId: string;
  iTwinId: string;
  name: ReactNode;
  description: string | undefined;
  authorizationClient: AuthorizationClient;
}

export function IModelTile(props: IModelTileProps): ReactElement {
  const navigate = useNavigate();
  const [thumbnail, setThumbnail] = useState<string>();
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(
    () => {
      const element = divRef.current;
      const authorizationClient = props.authorizationClient;
      if (thumbnail !== undefined || !element || !authorizationClient) {
        return;
      }

      let disposed = false;
      intersectionObserver.observe(
        element,
        async (isIntersecting: boolean) => {
          if (isIntersecting) {
            const response = await getIModelThumbnail(props.iModelId, { authorizationClient });
            if (!disposed && response) {
              setThumbnail(URL.createObjectURL(response));
            }
          }
        },
      );

      return () => {
        disposed = true;
        intersectionObserver.unobserve(element);
        thumbnail && URL.revokeObjectURL(thumbnail);
      };
    },
    [props.iModelId, thumbnail, props.authorizationClient],
  );

  return (
    <Tile
      name={props.name}
      description={props.description ?? <Text isSkeleton />}
      thumbnail={thumbnail ?? <div ref={divRef} id="imodel-thumbnail-placeholder" />}
      isActionable
      onClick={() => navigate(`/open-imodel/${props.iTwinId}/${props.iModelId}`)}
    />
  );
}

class ViewportIntersectionObserver {
  private observer: IntersectionObserver;
  private observers: Map<Element, (isIntersecting: boolean) => void>;

  constructor() {
    this.observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        this.observers.get(entry.target)?.(entry.isIntersecting);
      }
    });
    this.observers = new Map();
  }

  public dispose(): void {
    this.observer.disconnect();
  }

  public observe(element: Element, onObservation: (isIntersecting: boolean) => void): void {
    this.observers.set(element, onObservation);
    this.observer.observe(element);
  }

  public unobserve(element: Element): void {
    this.observer.unobserve(element);
    this.observers.delete(element);
  }
}

const intersectionObserver = new ViewportIntersectionObserver();
