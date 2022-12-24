/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="deno.ns" />
/// <reference lib="deno.window" />
/// <reference lib="dom" />

/**
 * ## 🏷️ etag
 *
 * Deno-friendly utilities for encoding, decoding, and handling ETags in
 * HTTP requests and responses. Plays well with server frameworks like Oak.
 *
 * ### Usage
 *
 * ```ts
 * import etag from "https://deno.land/x/etag@0.0.2/mod.ts";
 *
 * etag(`<svg xmlns="http://www.w3.org/2000/svg"><!-- ... --></svg>`);
 *
 * etag.encode(
 *    entity: string | FileInfo | ArrayBuffer | Uint8Array | BodyInit,
 *    options?: boolean | { weak?: boolean }
 * ): string;
 * ```
 *
 * For more examples and documentation, refer to the module homepage at
 * [**deno.land/x/etag**](https://deno.land/x/etag/mod.ts?doc).
 *
 * ### Prior Art
 *
 * Inspired by both the Oak framework's etag.ts module, and the OG jshttp/etag
 * package of the Node ecosystem.
 *
 * @see {@link https://github.com/deno911/etag GitHub Repository}
 * @see {@link https://deno.land/x/oak/etag.ts?source oak/etag.ts}
 * @see {@link https://npmjs.org/package/etag jshttp/etag}
 *
 * @author Nicholas Berlette <https://github.com/nberlette>
 * @module etag
 * @version 0.0.2
 * @license MIT
 */

import {
  assert,
  decodeEntityTag,
  decodeStatTag,
  digestSync,
  ETAG_EMPTY,
  ETAG_LENGTH,
  ETAG_MTIME_LENGTH,
  ETAG_RADIX,
  getEntity,
  is,
  isFileInfo,
} from "./_util.ts";

import type {
  Context,
  DecodedEntityTag,
  DecodedStatTag,
  Entity,
  ETagOptions,
  FileInfo,
  Id,
  Middleware,
  Options,
  State,
} from "./mod.d.ts";

export type { DecodedEntityTag, DecodedStatTag, ETagOptions, Options };

/**
 * Calculate an ETag value for an entity. If the entity is `FileInfo`, then the
 * tag will default to a _weak_ ETag.  `options.weak` overrides any default
 * behavior in generating the tag.
 *
 * @param entity A string, Uint8Array, or file info to use to generate the ETag
 * @param options either a boolean - a shorthand way to set `options.weak` - or an object of type `{ weak?: boolean; statTag?: boolean; }`
 * @example
 * ```ts
 * import * as etag from "https://deno.land/x/etag@0.0.2/mod.ts";
 * import $ from "https://deno.land/x/dax/mod.ts";
 *
 * for await (const f of $.fs.expandGlob("./src/*.ts")) {
 *   console.log(f.name);
 *   const stat = Deno.statSync(f.path);
 *   const tag = etag.encode(stat);
 *   console.log("  stat:\n\t%s", JSON.stringify(stat, null, 2));
 *   console.log("  eTag:\n\t%s", tag);
 * }
 * ```
 */
export function encode(entity: Entity, options: Options = {}): string {
  const opt = is.boolean(options)
    ? { weak: Boolean(options), statTag: false }
    : { weak: false, statTag: false, ...(options ?? {}) };

  const utf8 = new TextEncoder();
  function calcStatTag(entity: FileInfo): string {
    const mtime = new Date(entity.mtime || Date.now()).getTime().toString(16);

    const size = entity.size?.toString(16);

    return `"${size}-${mtime}"`;
  }

  function calcEntityTag(entity: Entity) {
    let length: string | number = 0;
    if (is.uint8Array(entity) && entity.length === 0) {
      return ETAG_EMPTY;
    } else if (is.string(entity)) {
      length = entity.length;
      entity = utf8.encode(entity);
    } else if (is.arrayBuffer(entity)) {
      length = entity.byteLength;
      entity = new Uint8Array(entity);
      assert.uint8Array(entity);
      length = entity.length;
    }

    length &&= length.toString(ETAG_RADIX) ?? 0;
    const hash = digestSync(entity).slice(0, ETAG_LENGTH);

    return `"${length}-${hash}"`;
  }

  // and now we actually calculate the ETag...
  const hasFileInfo = isFileInfo(entity) || (isFileInfo(entity) && opt.statTag);
  const cmd = hasFileInfo ? calcStatTag : calcEntityTag;
  const tag = cmd(entity as any);

  const prefix = (opt.weak || hasFileInfo) ? "W/" : "";
  return `${prefix}${tag}`;
}
/**
 * Attempt to decode an etag into the relevant file info. This is experimental,
 * and by design is only compatible with ETags that were either 1) generated
 * using this module, or 2) generated with a similar library that uses the same
 * API to generate its tags.
 *
 * @param etag The ETag to decode
 * @returns an object of type DecodedStatTag or DecodedEntityTag, depending on
 * which format was used to create the tag, or `undefined` if the decoding
 * process was unsuccessful.
 * @see {@linkcode encode} to understand the algorithm used to generate the
 * tags that this method attempts to decode.
 *
 * @example
 * ```ts
 * // continuing the example from etag.encode
 *
 * import * as etag from "https://deno.land/x/etag/mod.ts";
 * import $ from "https://deno.land/x/dax/mod.ts";
 *
 * for await (const f of $.fs.expandGlob("./src/*.ts")) {
 *   console.log(f.name);
 *   const stat = Deno.statSync(f.path);
 *
 *   const encoded = etag.encode(stat);
 *   console.log("  stat:\n\t%s", JSON.stringify(stat, null, 2));
 *   console.log("  eTag:\n\t%s", encoded);
 *
 *   const decoded = etag.decode(encoded);
 *   console.log("  decoded:\n\t%s\n", JSON.stringify(decoded, null, 2));
 * }
 * ```
 */
export function decode(
  etag: string,
): Partial<DecodedStatTag | DecodedEntityTag> | undefined {
  try {
    etag = etag.trim();
    const weak = /^W\//.test(etag);
    const value = etag.replace(/^(?:W\/)?"(.*)"$/, "$1").trim();

    const isStatTag = value.split("-")[1].length <= ETAG_MTIME_LENGTH;

    const decoded = (isStatTag ? decodeStatTag : decodeEntityTag)(value);
    return { weak, etag, ...decoded };
  } catch (err) {
    console.error(err);
    return undefined;
  }
}

/**
 * Create middleware that will attempt to decode the response.body into
 * something that can be used to generate an `ETag` and add the `ETag` header to
 * the response.
 */
export function factory<S extends State>(
  options: Options = {},
): Middleware<S> {
  return async function etag(ctx: Context<S>, next) {
    next();
    if (!ctx.response.headers.has("ETag")) {
      const opt = is.boolean(options)
        ? { weak: Boolean(options), statTag: false }
        : { weak: false, statTag: false, ...(options ?? {}) };

      const entity = await getEntity(ctx);
      if (entity) {
        ctx.response.headers.set("ETag", encode(entity, opt));
      }
    }
  };
}

/**
 * A helper function that takes the value from the `If-Match` header and an
 * entity and returns `true` if the `ETag` for the entity matches the supplied
 * value, otherwise `false`.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-Match
 */
export function ifMatch(
  value: string,
  entity: Entity,
  options: Options = {},
): boolean {
  const opt = is.boolean(options)
    ? { weak: Boolean(options), statTag: false }
    : { weak: false, statTag: false, ...(options ?? {}) };

  const etag = encode(entity, opt);
  // Weak tags cannot be matched and return false.
  if (etag.startsWith("W/")) {
    return false;
  }
  if (value.trim() === "*") {
    return true;
  }
  const tags = value.split(/\s*,\s*/);
  return tags.includes(etag);
}

/**
 * A helper function that takes the value from the `If-No-Match` header and
 * an entity and returns `false` if the `ETag` for the entity matches the
 * supplied value, otherwise `false`.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-None-Match
 */
export function ifNoneMatch(
  value: string,
  entity: Entity,
  options: Options = {},
): boolean {
  if (value.trim() === "*") {
    return false;
  }
  const opt = { weak: is.boolean(options) ? !!options : false, statTag: false };

  if (is.plainObject(options)) {
    Object.assign(opt, options ?? {});
  }

  const etag = encode(entity, opt);
  const tags = value.split(/\s*,\s*/);
  return !tags.includes(etag);
}

export { ifNoneMatch as ifNoMatch };

const etag = {
  encode,
  decode,
  ifMatch,
  ifNoneMatch,
  factory,
} as const;

interface ETag extends Id<typeof etag> {
  /**
   * Calculate an ETag value for an entity. If the entity is `FileInfo`, then
   * the tag will default to a _weak_ ETag.  `options.weak` overrides any
   * default behavior in generating the tag.
   *
   * @param entity A string, Uint8Array, or FileInfo used to generate the ETag
   * @param options either a boolean (shorthand for `options.weak`), or object
   * of shape `{ weak?: boolean; statTag?: boolean; }`
   * @example
   * ```ts
   * import * as etag from "https://deno.land/x/etag@0.0.2/mod.ts";
   * import $ from "https://deno.land/x/dax/mod.ts";
   *
   * for await (const f of $.fs.expandGlob("./src/*.ts")) {
   *   console.log(f.name);
   *   const stat = Deno.statSync(f.path);
   *   const tag = etag.encode(stat);
   *   console.log("  stat:\n\t%s", JSON.stringify(stat, null, 2));
   *   console.log("  eTag:\n\t%s", tag);
   * }
   * ```
   */
  (entity: Entity, options?: Options): string;
}

const { assign, defineProperties: define } = Object;

/**
 * The default export is a simple clone of the exported `encode` function, with
 * all of all of the named exports defined as properties underneath it.
 *
 * This allows for the following usage when importing via the default export:
 *
 * @example
 * ```ts
 * import etag from "https://deno.land/x/etag@0.0.2/mod.ts";
 *
 * etag("hello deno911");
 * // 👆🏻 and 👇🏼 are identical
 * etag.encode("hello deno911");
 * ```
 */
const etagEncode = ((...a) => encode(...a)) as typeof encode;

define(etagEncode, {
  [Symbol.toStringTag]: { value: "ETag", configurable: true },
  name: { value: "ETag" },
});

export default assign(etagEncode, etag) as ETag;
