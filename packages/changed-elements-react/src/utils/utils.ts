/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

export async function* splitBeforeEach<T, U>(
  iterable: AsyncIterable<T>,
  selector: (value: T) => U,
  markers: U[],
): AsyncGenerator<T[]> {
  let accumulator: T[] = [];
  let currentMarkerIndex = 0;
  for await (const value of iterable) {
    if (currentMarkerIndex !== markers.length && selector(value) === markers[currentMarkerIndex]) {
      yield accumulator;
      accumulator = [];
      ++currentMarkerIndex;
    }

    accumulator.push(value);
  }

  yield accumulator;
}


export async function* flatten<T>(iterable: AsyncIterable<T[]>): AsyncGenerator<T> {
  for await (const values of iterable) {
    for (const value of values) {
      yield value;
    }
  }
}

export async function* map<T, U>(iterable: AsyncIterable<T>, transform: (value: T) => U): AsyncGenerator<U> {
  for await (const value of iterable) {
    yield transform(value);
  }
}

export async function* skip<T>(iterable: AsyncIterable<T>, n: number): AsyncGenerator<T> {
  const iterator = iterable[Symbol.asyncIterator]();
  for (let i = 0; i < n; ++i) {
    const result = await iterator.next();
    if (result.done) {
      return result.value;
    }
  }

  let result = await iterator.next();
  while (!result.done) {
    yield result.value;
    result = await iterator.next();
  }

  return result.value;
}

export async function tryXTimes<T>(func: () => Promise<T>, attempts: number, delayInMilliseconds: number = 5000): Promise<T> {
  let error: unknown = null;
  while (attempts > 0) {
    try {
      return await func();
    } catch (err) {
      attempts--;
      error = err;
      await new Promise((resolve) => setTimeout(resolve, delayInMilliseconds));
    }
  }
  throw error;
}
