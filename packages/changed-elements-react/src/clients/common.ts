/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type { ChangedElements } from "@itwin/core-common";
import type { ChangedElementsPayload, ChangedElementsResult } from "./IComparisonJobClient.js";

export interface CommonRequestParams {
  signal?: AbortSignal | undefined;
}

export type HalLinks<T extends Array<string | undefined>> = {
  [K in keyof T as T[K] & string]: { href: string; };
};

/**
 * Result payloads above this size get `properties`/`oldChecksums`/`newChecksums` dropped while
 * parsing so the browser can still load the comparison. Elements keep their Property type-of-change
 * bit, but which properties changed is unknown (property filtering is unavailable).
 */
export const largePayloadThresholdBytes = 256 * 1024 * 1024;
const largePayloadOmittedKeys = new Set(["properties", "oldChecksums", "newChecksums"]);

/**
 * Parses a Changed Elements result body. Payloads whose `Content-Length` exceeds
 * {@link largePayloadThresholdBytes} are parsed without property data and flagged via
 * `changedElements.propertiesOmitted`.
 */
export async function readChangedElementsPayload(
  response: Response,
  isPayload: (value: unknown) => value is ChangedElementsPayload,
): Promise<ChangedElementsPayload> {
  const contentLength = Number(response.headers.get("Content-Length"));
  const propertiesOmitted = contentLength > largePayloadThresholdBytes;
  const body = await parseJsonResponse(response, propertiesOmitted ? largePayloadOmittedKeys : undefined);
  if (!isPayload(body)) {
    throw new Error(`Changed Elements request to ${response.url} returned an unexpected response shape.`);
  }

  if (!propertiesOmitted) {
    return body;
  }

  // Streaming parse already skipped these; this covers the `response.json()` fallback.
  const changedElements: ChangedElementsResult = { ...body.changedElements, propertiesOmitted };
  largePayloadOmittedKeys.forEach((key) => delete changedElements[key as keyof ChangedElements]);
  return { changedElements };
}

/**
 * Parses a JSON response body incrementally. Unlike `response.json()`, the full body text is never
 * materialized, so payloads larger than V8's ~512 MiB string limit (which otherwise fail with
 * "Unexpected end of JSON input") can be parsed. Falls back to `response.json()` when no body stream
 * is available (e.g. test mocks).
 * @param omitKeys Object keys whose values are discarded without being materialized.
 */
export async function parseJsonResponse(response: Response, omitKeys?: Set<string>): Promise<unknown> {
  if (!response.body) {
    return response.json();
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  const parser = new IncrementalJsonParser(omitKeys);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    parser.write(decoder.decode(value, { stream: true }));
  }

  parser.write(decoder.decode());
  return parser.end();
}

/** Number/literal token: runs until a JSON delimiter; the token itself is validated by `JSON.parse`. */
const scalarToken = /^[^\s,:[\]{}"]+/;

/** Minimal streaming JSON parser; tolerant of chunk boundaries splitting any token. */
class IncrementalJsonParser {
  private _buffer = "";
  private _stack: Array<unknown[] | Record<string, unknown>> = [];
  private _key: string | undefined;
  private _root: unknown;
  private _hasRoot = false;
  /** Stack depth of the object whose current value is being discarded, if any. */
  private _skipDepth: number | undefined;

  constructor(private _omitKeys?: Set<string>) { }

  public write(text: string): void {
    this._buffer += text;
    this._buffer = this._buffer.slice(this._consume(false));
  }

  public end(): unknown {
    this._buffer = this._buffer.slice(this._consume(true));
    if (!this._hasRoot || this._stack.length > 0 || this._buffer.trim().length > 0) {
      throw new SyntaxError("Unexpected end of JSON input");
    }

    return this._root;
  }

  /** Parses as many complete tokens as the buffer holds; returns how many chars were consumed. */
  private _consume(final: boolean): number {
    const buf = this._buffer;
    let i = 0;
    while (i < buf.length) {
      const c = buf[i];
      if (c === " " || c === "\n" || c === "\r" || c === "\t" || c === "," || c === ":") {
        i++;
      } else if (c === "{" || c === "[") {
        const container = c === "{" ? {} : [];
        this._emit(container, true);
        this._stack.push(container);
        i++;
      } else if (c === "}" || c === "]") {
        if (this._stack.pop() === undefined) {
          throw new SyntaxError(`Unexpected token ${c} in JSON`);
        }

        if (this._stack.length === this._skipDepth) {
          this._skipDepth = undefined;
        }

        i++;
      } else if (c === "\"") {
        let j = i + 1;
        while (j < buf.length && buf[j] !== "\"") {
          j += buf[j] === "\\" ? 2 : 1;
        }

        if (j >= buf.length) {
          break;
        }

        this._emit(this._skipDepth === undefined ? JSON.parse(buf.slice(i, j + 1)) : undefined, false);
        i = j + 1;
      } else {
        const token = scalarToken.exec(buf.slice(i, i + 64))?.[0] ?? "";
        // A scalar touching the buffer end may continue in the next chunk.
        if (i + token.length === buf.length && !final) {
          break;
        }

        this._emit(this._skipDepth === undefined ? JSON.parse(token) : undefined, false);
        i += token.length;
      }
    }

    return i;
  }

  private _emit(value: unknown, isContainer: boolean): void {
    if (this._skipDepth !== undefined) {
      if (!isContainer && this._stack.length === this._skipDepth) {
        this._skipDepth = undefined;
      }

      return;
    }

    const top = this._stack[this._stack.length - 1];
    if (top === undefined) {
      if (this._hasRoot) {
        throw new SyntaxError("Unexpected token after JSON root");
      }

      this._root = value;
      this._hasRoot = true;
    } else if (Array.isArray(top)) {
      top.push(value);
    } else if (this._key === undefined) {
      if (typeof value !== "string") {
        throw new SyntaxError("Expected string key in JSON object");
      }

      if (this._omitKeys?.has(value)) {
        this._skipDepth = this._stack.length;
      } else {
        this._key = value;
      }
    } else {
      top[this._key] = value;
      this._key = undefined;
    }
  }
}
