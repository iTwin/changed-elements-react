/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import clsx from "clsx";
import {
  useLayoutEffect, useRef, useState, type ReactElement, type ReactNode, type RefObject
} from "react";

import "./Sticky.css";

interface StickyProps {
  className?: string | undefined;
  children?: ReactNode | undefined;
}

/**
 * A <div /> element that clings to the top of a scrollable container when scrolled
 * past. While the element is stuck, it displays a subtle shadow beneath.
 */
export function Sticky(props: StickyProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const stuck = useIsStuck(ref);

  return (
    <div ref={ref} className={clsx("_cer_v1_sticky", props.className)} data-stuck={stuck}>
      {props.children}
    </div>
  );
}

/**
 * When given an element with `position: sticky`, finds its closest scrollable container,
 * and determines whether the container has scrolled down far enough for the element
 * to shift from its resting position.
 */
function useIsStuck(ref: RefObject<HTMLElement>): boolean {
  const [stuck, setStuck] = useState(false);

  useLayoutEffect(
    () => {
      const stuckElement = ref.current;
      if (!stuckElement) {
        return;
      }

      const scrollableParent = findScrollableParent(stuckElement.parentElement);
      const handleScroll = () => {
        const parentOffset = stuckElement.parentElement?.offsetTop ?? stuckElement.offsetTop;
        setStuck(parentOffset < stuckElement.offsetTop);
      };
      scrollableParent?.addEventListener("scroll", handleScroll);
      return () => scrollableParent?.removeEventListener("scroll", handleScroll);
    },
    [ref],
  );

  return stuck;
}

function findScrollableParent(element: HTMLElement | null | undefined): HTMLElement | undefined {
  if (!element) {
    return undefined;
  }

  const style = getComputedStyle(element);
  if (style.overflowY !== "visible" && style.overflowY !== "hidden") {
    return element;
  }

  return findScrollableParent(element.parentElement);
}
