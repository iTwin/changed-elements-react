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

/** Whether a result response is too large to load with property data, judged by its `Content-Length`. */
export function isLargePayload(response: Response): boolean {
  return Number(response.headers.get("Content-Length")) > largePayloadThresholdBytes;
}

/**
 * Parses a Changed Elements result body. Payloads whose `Content-Length` exceeds
 * {@link largePayloadThresholdBytes} are parsed without property data and flagged via
 * `changedElements.propertiesOmitted`.
 * @param propertiesOmitted Force the omitted flag, e.g. when `response` is already a property-less minimal blob.
 */
export async function readChangedElementsPayload(
  response: Response,
  isPayload: (value: unknown) => value is ChangedElementsPayload,
  propertiesOmitted = isLargePayload(response),
): Promise<ChangedElementsPayload> {
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
 * Bodies decoding to fewer UTF-16 code units than this are parsed with native `JSON.parse`, which
 * is several times faster than the incremental parser. V8 strings cap at ~512 Mi code units.
 */
const nativeParseMaxChars = 480 * 1024 * 1024;

/**
 * Parses a JSON response body. The body is streamed and decoded; while nothing needs to be
 * discarded and the decoded text stays under `maxChars` it is buffered and handed to native
 * `JSON.parse`. Once it grows past that limit (or when `omitKeys` is given, so the omitted data is
 * never materialized) the buffered text and the rest of the stream go through the incremental
 * parser, so payloads beyond V8's string limit still load. Response headers are deliberately not
 * consulted: `Content-Length` counts compressed bytes and CORS hides `Content-Encoding`. Falls back
 * to `response.json()` when no body stream is available (e.g. test mocks).
 * @param omitKeys Object keys whose values are discarded without being materialized.
 * @param maxChars Decoded size at which parsing switches to incremental; exposed for tests.
 */
export async function parseJsonResponse(
  response: Response,
  omitKeys?: Set<string>,
  maxChars = nativeParseMaxChars,
): Promise<unknown> {
  if (!response.body) {
    return response.json();
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let parser = omitKeys === undefined ? undefined : new IncrementalJsonParser(omitKeys);
  const parts: string[] = [];
  let chars = 0;
  const write = (text: string) => {
    if (parser !== undefined) {
      parser.write(text);
      return;
    }

    parts.push(text);
    chars += text.length;
    if (chars >= maxChars) {
      const incremental = new IncrementalJsonParser();
      parts.forEach((part) => incremental.write(part));
      parts.length = 0;
      parser = incremental;
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    write(decoder.decode(value, { stream: true }));
  }

  write(decoder.decode());
  return parser !== undefined ? parser.end() : JSON.parse(parts.join(""));
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
        const closed = this._stack.pop();
        if (closed === undefined || Array.isArray(closed) !== (c === "]")) {
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
