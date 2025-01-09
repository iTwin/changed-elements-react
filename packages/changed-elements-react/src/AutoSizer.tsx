/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import {
  forwardRef, useLayoutEffect, useMemo, useRef, useState, type HTMLAttributes, type ReactNode
} from "react";

import { mergeRefs } from "./common.js";

export interface AutoSizerProps extends HTMLAttributes<HTMLDivElement> {
  children: (size: Size) => ReactNode;
}

export interface Size {
  width: number;
  height: number;
}

export const AutoSizer = forwardRef<HTMLDivElement, AutoSizerProps>(
  function Autosizer(props, ref) {
    const divRef = useRef(null as unknown as HTMLDivElement);
    const [size, setSize] = useState<Size>();

    useLayoutEffect(
      () => {
        const resizeObserver = new ResizeObserver(
          (entries: ResizeObserverEntry[]) => {
            const { width, height } = entries[0].contentRect;
            setSize({ width, height });
          },
        );
        resizeObserver.observe(divRef.current);
        return () => resizeObserver.disconnect();
      },
      [],
    );

    const mergedRefs = useMemo(() => mergeRefs(divRef, ref), [divRef, ref]);
    return <div ref={mergedRefs} className={props.className}>{size && props.children(size)}</div>;
  },
);

