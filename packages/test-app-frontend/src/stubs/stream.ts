/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** Stubs Node.js Stream module so that no errors occur in the browser. */
export default class Stream {
  public on() { }
}

export { Stream };
