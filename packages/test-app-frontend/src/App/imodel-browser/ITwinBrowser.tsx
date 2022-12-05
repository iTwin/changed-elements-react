/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { ReactElement, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SvgProject } from "@itwin/itwinui-icons-react";
import { FluidGrid, Grid, PageLayout } from "@itwin/itwinui-layouts-react";
import { Surface, Text, Tile } from "@itwin/itwinui-react";
import { useAuthorization } from "../Authorization";
import { LoadingScreen } from "../common/LoadingScreen";
import { getRecentITwins, GetRecentITwinsResult } from "../ITwinApi";

export function ITwinBrowser(): ReactElement {
  const navigate = useNavigate();
  const { userAuthorizationClient } = useAuthorization();
  const [iTwins, setITwins] = useState<GetRecentITwinsResult["iTwins"]>();

  useEffect(
    () => {
      if (userAuthorizationClient === undefined) {
        return;
      }

      let disposed = false;
      void (async () => {
        const result = await getRecentITwins({ authorizationClient: userAuthorizationClient });
        if (!disposed) {
          setITwins(result?.iTwins);
        }
      })();

      return () => { disposed = true; };
    },
    [userAuthorizationClient],
  );

  if (iTwins === undefined) {
    return <LoadingScreen>Loading content...</LoadingScreen>;
  }

  return (
    <PageLayout.Content padded>
      <PageLayout.TitleArea>
        <Text variant="headline">Projects</Text>
      </PageLayout.TitleArea>
      <Surface style={{ padding: 24 }} elevation={1}>
        <Grid>
          <Grid.Item columnSpan={12}>
            <Text variant="title">Recent</Text>
          </Grid.Item>
          <Grid.Item columnSpan={12}>
            <FluidGrid>
              {
                iTwins.map((iTwin) => (
                  <Tile
                    key={iTwin.id}
                    name={iTwin.displayName}
                    variant="folder"
                    isActionable
                    thumbnail={<SvgProject />}
                    description={iTwin.number}
                    onClick={() => navigate(iTwin.id)}
                  />
                ))
              }
            </FluidGrid>
          </Grid.Item>
        </Grid>
      </Surface>
    </PageLayout.Content>
  );
}
