/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { AuthorizationClient } from "@itwin/core-common";
import { FluidGrid, PageLayout } from "@itwin/itwinui-layouts-react";
import { Surface, Text, Tile } from "@itwin/itwinui-react";
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { applyUrlPrefix } from "../../environment.js";
import { useAuthorization } from "../Authorization.js";
import { callITwinApi, getIModelThumbnail, GetITwinIModelsResult } from "../ITwinApi.js";
import { Paginator } from "./Paginator.js";

export function IModelBrowser(): ReactElement {
  const { iTwinId } = useParams<{ iTwinId: string; }>();
  const navigate = useNavigate();

  const recentIModelsKey = `recent_imodels_${iTwinId}`;
  const [recentIModels] = useState<string[]>(
    (() => {
      const item = localStorage.getItem(recentIModelsKey);
      if (item) {
        return JSON.parse(item);
      }

      return [];
    })(),
  );

  const { authorizationClient } = useAuthorization();

  const fetchIModels = (url: string) => callITwinApi(
    {
      url,
      additionalHeaders: { Prefer: "return=representation" },
      apiVersion: 2,
      postProcess: async (response) => response.json(),
    },
    { authorizationClient },
  ) as Promise<GetITwinIModelsResult>;

  const handleTileClick = (iModelId: string) => {
    const existingIndex = recentIModels.indexOf(iModelId);
    let updatedRecentIModels: string[];
    if (existingIndex !== -1) {
      updatedRecentIModels = recentIModels.toSpliced(existingIndex, 1);
    } else {
      updatedRecentIModels = recentIModels.slice(0, 5);
    }

    updatedRecentIModels.unshift(iModelId);
    localStorage.setItem(recentIModelsKey, JSON.stringify(updatedRecentIModels));

    navigate(`/itwinjs/open-imodel/${iTwinId}/${iModelId}`);
  };

  return (
    <PageLayout.Content padded>
      <Paginator
        initialUrl={applyUrlPrefix(`https://api.bentley.com/imodels?iTwinId=${iTwinId}`)}
        fetch={fetchIModels}
      >
        {
          (result) => (
            <div style={{ display: "grid", gap: "var(--iui-size-xl)" }}>
              <Surface style={{ padding: "var(--iui-size-l)", display: "grid", gap: "var(--iui-size-l)" }}>
                <Text variant="title">Recent</Text>
                <FluidGrid>
                  {
                    recentIModels.length === 0 &&
                    <Text>No recent iModels</Text>
                  }
                  {
                    recentIModels.length > 0 && recentIModels.map((iModelId) => {
                      const iModel = result.iModels.find(({ id }) => id === iModelId);
                      if (iModel) {
                        return (
                          <IModelTile
                            key={iModel.id}
                            iTwinId={iModel.iTwinId}
                            iModelId={iModel.id}
                            name={iModel.name}
                            description={iModel.description ?? undefined}
                            authorizationClient={authorizationClient}
                            onClick={() => handleTileClick(iModel.id)}
                          />
                        );
                      }

                      return undefined;
                    })
                  }
                </FluidGrid>
              </Surface>
              <div style={{ display: "grid", gap: "var(--iui-size-l)" }}>
                <Text variant="title">All iModels</Text>
                <FluidGrid>
                  {
                    result.iModels.map((iModel) => (
                      <IModelTile
                        key={iModel.id}
                        iTwinId={iModel.iTwinId}
                        iModelId={iModel.id}
                        name={iModel.name}
                        description={iModel.description ?? undefined}
                        authorizationClient={authorizationClient}
                        onClick={() => handleTileClick(iModel.id)}
                      />
                    ))
                  }
                </FluidGrid>
              </div>
            </div>
          )
        }
      </Paginator>
    </PageLayout.Content>
  );
}

export interface IModelTileProps {
  iModelId: string;
  iTwinId: string;
  name: ReactNode;
  description: string | undefined;
  authorizationClient: AuthorizationClient;
  onClick: () => void;
}

export function IModelTile(props: IModelTileProps): ReactElement {
  const [thumbnail, setThumbnail] = useState<string>();
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(
    () => {
      const element = divRef.current;
      const authorizationClient = props.authorizationClient;
      if (thumbnail !== undefined || !element) {
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
      onClick={props.onClick}
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
