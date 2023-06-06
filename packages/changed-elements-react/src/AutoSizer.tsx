/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import {
  forwardRef, useLayoutEffect, useRef, useState, type ForwardedRef, type HTMLAttributes, type ReactNode,
  type RefCallback
} from "react";

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

    return <div ref={mergeRefs(divRef, ref)} className={props.className}>{size && props.children(size)}</div>;
  },
);

function mergeRefs<T>(...refs: Array<ForwardedRef<T>>): RefCallback<T> {
  return (value) => {
    refs.forEach((ref) => {
      if (typeof ref === "function") {
        ref(value);
      } else if (ref) {
        ref.current = value;
      }
    });
  };
}
