/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @module Utilities */

/** Shorthand for "any function".
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FunctionType = (...args: any[]) => any;

/**
 * Similar to the built-in [Readonly](https://www.typescriptlang.org/docs/handbook/advanced-types.html#mapped-types), type alias but applied recursively.
 * This basically makes all nested properties/members of an object/array immutable.
 * @public
 */
export type DeepReadonly<T> = T extends ReadonlyArray<infer R>
  ? R extends object
    ? DeepReadonlyArray<R>
    : ReadonlyArray<R>
  : T extends FunctionType
  ? T
  : T extends object
  ? DeepReadonlyObject<T>
  : T;

/** TypeScript doesn't actually allow recursive type aliases, so these are just sort of a hack to make DeepReadonly work
 * @public
 */
export type DeepReadonlyArray<T> = ReadonlyArray<DeepReadonly<T>>
/** TypeScript doesn't actually allow recursive type aliases, so these are just sort of a hack to make DeepReadonly work
 * @public
 */
export type DeepReadonlyObject<T> = {
  readonly [P in keyof T]: DeepReadonly<T[P]>;
};

/**
 * A basic Redux [Action](https://redux.js.org/basics/actions).
 * Technically, redux only requires actions to have a `type` property.
 *
 * We use a TypeScript [Generic](https://www.typescriptlang.org/docs/handbook/generics.html) interface here to preserve the "literal-ness" of the `type` property.
 * In other words, `Action<"FOO">` will be of type `{ type: "FOO" }`; it won't be simplified to `{ type: string }`.
 *
 * See the [TS Handbook](https://www.typescriptlang.org/docs/handbook/advanced-types.html#string-literal-types) for more info on TypeScript string literal types.
 * @public
 */
export interface Action<T extends string> {
  type: T;
}

/**
 * A Redux [Action](https://redux.js.org/basics/actions), with additional "payload" information.
 * Technically, Redux allows actions to take any shape, provided they specify a `type` property.
 *
 * However, in order to simplify TypeScript typings, we follow this [Flux Standard Actions](https://github.com/redux-utilities/flux-standard-action)-like
 * convention, where all additional action information goes into a `payload` property.
 * @public
 */
export interface ActionWithPayload<T extends string, P> extends Action<T> {
  payload: P;
}

/**
 * Creates a basic Redux Redux [Action](https://redux.js.org/basics/actions) without a payload.
 * **This is meant to be used as a shortcut for defining Action Creators.**
 *
 * For example,
 * ```
 *   () => createAction("FOO", ids)
 * ```
 * defines an action creator of type:
 * ```
 *   () => { type: "FOO" }
 *   // which is equivalent to:
 *   () => Action<"FOO">
 * ```
 *
 * Note that the generic type parameters can always be omitted - TypeScript will be able to infer them.
 * @param type The string to use as the action's type property. Should have a [string literal type](https://www.typescriptlang.org/docs/handbook/advanced-types.html#string-literal-types).
 * @public
 */
export function createAction<T extends string>(type: T): Action<T>;
/**
 * Creates a basic Redux Redux [Action](https://redux.js.org/basics/actions) _with_ a payload value.
 * **This is meant to be used as a shortcut for defining Action Creators.**
 *
 * For example,
 * ```
 *   (ids: number[]) => createAction("FOO", ids)
 * ```
 * defines an action creator of type:
 * ```
 *   (ids: number[]) => { type: "FOO", payload: ReadonlyArray<number> }
 *   // which is equivalent to:
 *   (ids: number[]) => ActionWithPayload<"FOO", ReadonlyArray<number>>
 * ```
 *
 * Note that the generic type parameters can always be omitted - TypeScript will be able to infer them.
 * @param type The string to use as the action's type property. Should have a [string literal type](https://www.typescriptlang.org/docs/handbook/advanced-types.html#string-literal-types).
 * @param payload The value to use as the action's payload property. May be of any type.
 * @public
 */
export function createAction<T extends string, P>(
  type: T,
  payload: P
): ActionWithPayload<T, DeepReadonly<P>>;
export function createAction<T extends string, P>(type: T, payload?: P) {
  return payload === undefined ? { type } : { type, payload };
}

/**
 * Just an object where every property is a Redux [Action Creator](https://redux.js.org/basics/actions#action-creators).
 * @public
 */
export type ActionCreatorsObject = {
  [actionCreatorName: string]: FunctionType;
};

/**
 * A TypeScript type alias that represents the [Union Type](https://www.typescriptlang.org/docs/handbook/advanced-types.html#union-types) of all actions
 * possibly created by _any_ of the action creators in a given `ActionCreatorsObject`.
 *
 * For example,
 * ```
 *   // given:
 *   const MyActionCreators = {
 *     createBanana: () => createAction("BANANA"),
 *     createApple:  () => createAction("APPLE", true),
 *     createOrange: (n: number) => createAction("BANANA", n),
 *   }
 *   // then:
 *   type X = ActionsUnion<typeof MyActionCreators>;
 *   // is equivalent to:
 *   type X = Action<"BANANA">
 *            | ActionWithPayload<"APPLE", boolean>
 *            | ActionWithPayload<"ORANGE", number>;
 * ```
 * @public
 */
export type ActionsUnion<A extends ActionCreatorsObject> = ReturnType<
  A[keyof A]
>;
