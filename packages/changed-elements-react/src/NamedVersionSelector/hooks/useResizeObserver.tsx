/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { useState, useEffect } from "react";

// Object containing the width and height of an element.
export interface Dimensions {
  width: number;
  height: number;
}

/**
 * A custom hook that observes the size of an HTML element and returns its dimensions (width and height).
 * This hook uses the ResizeObserver API to monitor changes in the size of the element.
 *
 * @param ref - A React ref object pointing to the HTML element to observe.
 * @param dependencies - An optional dependency array. The hook will reinitialize the observer when any dependency changes.
 * @returns An object containing the current dimensions of the observed element: `{ width, height }`.
 *
 * @example
 * // Example usage:
 * import { useRef } from "react";
 * import { useResizeObserver } from "./hooks/useResizeObserver";
 *
 * function MyComponent() {
 *   const ref = useRef<HTMLDivElement>(null);
 *   const dimensions = useResizeObserver(ref, []);
 *
 *   return (
 *     <div ref={ref} style={{ resize: "both", overflow: "auto" }}>
 *       <p>Width: {dimensions.width}px</p>
 *       <p>Height: {dimensions.height}px</p>
 *     </div>
 *   );
 * }
 */
export function useResizeObserver(
  ref: React.RefObject<HTMLElement>,
  dependencies: React.DependencyList = [],
): Dimensions {
  const [dimensions, setDimensions] = useState<Dimensions>({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // We prefer to use borderBoxSize if available, as it is more reliable because it contains padding, but may not always be supported.
        // contentRect is a fallback for browsers that do not support borderBoxSize.
        // more info: https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserverEntry/borderBoxSize
        // more info: https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserverEntry/contentRect
        if (entry.borderBoxSize && entry.borderBoxSize.length > 0) {
          const borderBox = entry.borderBoxSize[0];
          setDimensions({
            width: borderBox.inlineSize,
            height: borderBox.blockSize,
          });
        } else if (entry.contentRect) {
          setDimensions({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
        }
      }
    });

    resizeObserver.observe(element);

    // Cleanup observer on unmount or when dependencies change, to avoid memory leaks.
    return () => {
      resizeObserver.disconnect();
    };
  // disabled because this includes ref in the dependency array
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies]);

  return dimensions;
}
