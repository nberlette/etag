import {
  type Assert,
  assert as $assert,
  AssertionError,
  base64,
  crypto,
  ERR_STREAM_ALREADY_FINISHED,
  ERR_STREAM_DESTROYED,
  is as $is,
  Stats,
  statSync,
} from "./deps.ts";

import type {
  Class,
  Context,
  DigestAlgorithm,
  Entity,
  FileInfo,
  Noop,
  State,
  VirtualFileInfo,
  VirtualFsFile,
} from "./mod.d.ts";

type AssertOptions = { multipleValues?: boolean };

type Clone<P extends {}> =
  | P extends infer T
    ? { -readonly [K in keyof T]: T[K]; }
  : never;

// define the shape of our modified assert object
// we'll be adding a callable signature as the default assert(),
// and we'll also be adding 3 method aliases for function, class, and null
declare interface assert extends Clone<typeof $assert> {
  /**
   * Asserts that a condition is true.
   * @param condition the condition to assert
   * @param description the message to throw if the condition is false
   * @category Types
   * @example ```ts
   * import { is} from "https://deno.land/x/dis@0.0.1/mod.ts";
   *
   * is.assert(true, "true is true");
   * ```
   */
  (condition: boolean, description?: string): asserts condition;
  /**
   * Asserts that a condition is true.
   * @param condition the condition to assert
   * @param description the message to throw if the condition is false
   * @category Types
   * @example ```ts
   * import { is} from "https://deno.land/x/dis@0.0.1/mod.ts";
   *
   * is.assert(true, "true is true");
   * ```
   */
  (
    condition: boolean,
    description: string,
    value: unknown,
    options?: AssertOptions,
  ): asserts condition;
  class: (value: unknown) => asserts value is Class<unknown, any[]>;
  function: (value: unknown) => asserts value is Function;
  null: (value: unknown) => asserts value is null;
}

// similar to above, defining the new shape of the "is" object (which includes
// an assert property that contains the whole assert object from above)
// we'll also be adding the same 3 method aliases for func/class/null
declare interface is extends Noop<typeof $is> {
  assert: assert;
  function: (value: unknown) => value is Function;
  class: (value: unknown) => value is Class<unknown, any[]>;
  null: (value: unknown) => value is null;
  request: (value: unknown) => value is Request;
  response: (value: unknown) => value is Response;
}

// the callable assert function, exposed as is.assert() / assert()
function assertFn(
  condition: boolean,
  description?: string,
  value?: unknown,
  options: { multipleValues?: boolean } = {},
): asserts condition {
  if (!condition) {
    const { multipleValues = false } = options;
    if (description == null) {
      throw new AssertionError(
        "Assertion of type failed! Received an unexpected value.",
      );
    }
    const valuesMessage = (multipleValues && is.array(value))
      ? `received values of types ${
        [
          ...new Set(
            (value as any[]).map((singleValue) => `\`${is(singleValue)}\``),
          ),
        ].join(", ")
      }`
      : `received value of type \`${is(value)}\``;

    throw new TypeError(
      `Expected value which is \`${description}\`, ${valuesMessage}.`,
    );
  }
}

// assign all the properties of the original assert object to the new assertFn
// and add the three aliases while we're at it too
export const assert: assert = Object.assign(assertFn, $assert, {
  function: $assert.function_,
  class: $assert.class_,
  null: $assert.null_,
});

// assign the new properties to the original $is function / object
// and export it as the desired final name: 'is'
export const is: is = Object.assign($is as is, {
  request: (value: unknown): value is Request => (value instanceof Request),
  response: (value: unknown): value is Response => (value instanceof Response),
});

export { type Assert };

type Algo = DigestAlgorithm;

/** @internal */
export function digestSync(entity: Entity, algo: Algo = "SHA-1"): string {
  /** @internal */
  function validateEntity(entity: Entity): Uint8Array {
    if (is.uint8Array(entity) || is.arrayBuffer(entity)) {
      return entity as Uint8Array;
    } else if (is.string(entity)) {
      // encode as (utf-8) Uint8Array
      return new TextEncoder().encode(entity);
    }
    is.assert(entity != null, "Entity cannot be null or undefined!");
    return entity as any;
  }

  const toHex = (v: number) => v.toString(16).padStart(2, "0");

  const buffer = validateEntity(entity);
  const hash = crypto.subtle.digestSync(algo, buffer);

  return base64.encode(Array.from(new Uint8Array(hash), toHex).join(""));
}

export function digest(entity: Entity, algo: Algo = "SHA-1"): Promise<string> {
  return Promise.resolve(digestSync(entity, algo));
}

/** @internal */
export function isFileInfo(obj: any): obj is FileInfo | Stats {
  if (is.function(Stats) && obj instanceof Stats) {
    return true;
  }
  // 🦆 🦆 🦆
  // deno-fmt-ignore
  return obj
    && is.nonEmptyObject(obj)
    // && "ctime" in obj
    && "mtime" in obj
    && "ino" in obj
    && "size" in obj
    && (is.any([is.date, is.string, is.number], obj.mtime))
    && is.any(is.number, obj.ino, obj.size)
    && is.number((obj as any).size);
}

/** @internal */
export function fstatSync<
  T extends VirtualFsFile["rid"] | VirtualFsFile,
>(file: T): VirtualFileInfo;
/** @internal */
export function fstatSync(file: Deno.FsFile): Deno.FileInfo;
/** @internal */
export function fstatSync(file: string | URL | Stats): FileInfo;

/** @internal */
export function fstatSync(file: any): any {
  // scaffolding for virtual fs support in the future
  if ("body" in file && "meta" in file) {
    return file.meta;
  }

  if (is.function(Deno.fstatSync)) {
    if (is.directInstanceOf(file, Deno.FsFile) || is.number(file.rid)) {
      return Deno.fstatSync(file.rid);
    }
  }

  if (is.urlInstance(file) || is.string(file)) {
    return statSync(file);
  }

  if (file instanceof Stats) {
    return { ...file };
  }

  return undefined;
}

/** @internal */
export function fstat<
  T extends VirtualFsFile["rid"] | VirtualFsFile,
>(file: T): Promise<VirtualFileInfo>;

/** @internal */
export function fstat(file: Deno.FsFile): Promise<FileInfo>;

/** @internal */
export function fstat(file: string | URL | Stats): Promise<FileInfo>;

/** @internal */
export function fstat(file: any): Promise<any> {
  try {
    return Promise.resolve(fstatSync(file));
  } catch (err) {
    return Promise.reject(err);
  }
}

/**
 * For a given Context, try to determine the response body entity that an ETag
 * can be calculated from.
 */
/** @internal */
export async function getEntity<C extends Context<S>, S = State>(
  ctx: C,
): Promise<Entity>;

/** @internal */
export async function getEntity<T extends Response>(res: T): Promise<Entity>;

/** @internal */
export async function getEntity<T extends BodyInit>(body: T): Promise<Entity>;

/** @internal */
export async function getEntity(ctx: any): Promise<any> {
  try {
    const getContextBody = (ctx: any) => {
      if (("response" in ctx) && is.response(ctx.response)) {
        if ((ctx as Context).response.bodyUsed) {
          throw new ERR_STREAM_ALREADY_FINISHED(
            "getEntity(ctx.response.arrayBuffer)",
          );
        }
        return (ctx as Context).response.arrayBuffer()!;
      } else if (is.response(ctx)) {
        if ((ctx as Response).bodyUsed) {
          throw new ERR_STREAM_ALREADY_FINISHED("getEntity(ctx.arrayBuffer");
        }
        return (ctx as Response).arrayBuffer()!;
      } else if (is.directInstanceOf(ctx, Deno.FsFile) || isFileInfo(ctx)) {
        return fstatSync(ctx as any);
      }
    };

    const body = await getContextBody(ctx);

    if (is.uint8Array(body) || is.arrayBuffer(body)) {
      return body;
    } else if (!is.nullOrUndefined(body) && is.nonEmptyObject(body)) {
      try {
        return JSON.stringify(body);
      } catch (err) {
        console.error(err);
        throw new ERR_STREAM_DESTROYED("getEntity(ctx)");
      }
    }

    return undefined;
  } catch (cause) {
    throw new Error(`Unable to determine entity body from given context!`, {
      cause,
    });
  }
}

/**
 * noop!
 */
export const noop = () => {};
