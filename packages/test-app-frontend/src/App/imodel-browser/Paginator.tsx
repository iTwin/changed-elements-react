/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { SvgChevronLeft, SvgChevronRight } from "@itwin/itwinui-icons-react";
import { Button } from "@itwin/itwinui-react";
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import type { HalLinks } from "../ITwinApi.js";

interface PaginatorProps<T> {
  initialUrl: string;
  fetch: (url: string) => Promise<T | undefined>;
  children: (result: T) => ReactNode;
}

interface FetchResult {
  _links: HalLinks<["next"?, "prev"?]>;
}

export function Paginator<T extends FetchResult>(props: PaginatorProps<T>): ReactElement {
  const [url, setUrl] = useState(props.initialUrl);
  const [result, setResult] = useState<T>();

  useEffect(
    () => {
      let disposed = false;
      void (async () => {
        const result = await (0, props.fetch)(url);
        if (!disposed) {
          setResult(result);
        }
      })();

      return () => { disposed = true; };
    },
    [props.fetch, url],
  );

  if (!result) {
    return <>Loading content...</>;
  }

  const showNavigation = result._links.prev || result._links.next;

  return (
    <div style={{ display: "grid" }}>
      {props.children(result)}
      <div style={{ marginTop: "var(--iui-size-l)", justifySelf: "center", display: "flex", gap: "var(--iui-size-s)" }}>
        {
          showNavigation &&
          <>
            <Button
              startIcon={<SvgChevronLeft />}
              disabled={!result._links.prev}
              onClick={() => setUrl(result._links.prev?.href ?? props.initialUrl)}
            >
              Previous
            </Button>
            <Button
              endIcon={<SvgChevronRight />}
              disabled={!result._links.next}
              onClick={() => setUrl(result._links.next?.href ?? props.initialUrl)}
            >
              Next
            </Button>
          </>
        }
      </div>
    </div>
  );
}
