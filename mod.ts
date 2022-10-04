/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="deno.ns" />
/// <reference lib="deno.window" />
/// <reference lib="dom" />

/*!
 * etag
 * Deno-friendly utilities for encoding, decoding, and handling ETags in
 * HTTP requests and responses. Plays well with server frameworks like Oak.
 *
 * ### Prior Art
 * Inspired by the Oak framework's etag.ts module, as well as jshttp/etag (npm)
 *
 * @copyright 2022+ Nicholas Berlette and the Deno911 Project
 * @license MIT
 *
 * @see {@link https://github.com/deno911/etag}
 * @see {@link https://deno.land/x/oak/etag.ts?source}
 * @see {@link https://npmjs.org/package/etag}
 * @module
 */

import { digestSync, getEntity, is, isFileInfo } from "./helpers.ts";

import type {
  Context,
  DecodedEntityTag,
  DecodedStatTag,
  Entity,
  ETagOptions,
  FileInfo,
  Middleware,
  Options,
  State,
} from "./mod.d.ts";

export type {
  Context,
  DecodedEntityTag,
  DecodedStatTag,
  Entity,
  ETagOptions,
  FileInfo,
  Middleware,
  Options,
  State,
};

const ETAG_EMPTY = `"0-2jmj7l5rSw0yVb/vlWAYkK/YBwk="`;
const ETAG_LENGTH = 27;
const ETAG_RADIX = 16;
const ETAG_MTIME_LENGTH = 12; // Date.now().toString(16).length + 1;

/**
 * Calculate an ETag value for an entity. If the entity is `FileInfo`, then the
 * tag will default to a _weak_ ETag.  `options.weak` overrides any default
 * behavior in generating the tag.
 *
 * @param entity A string, Uint8Array, or file info to use to generate the ETag
 * @param options either a boolean - a shorthand way to set `options.weak` - or an object of type `{ weak?: boolean; statTag?: boolean; }`
 * @example ```ts
 * import * as etag from "https://deno.land/x/etag@0.0.1/mod.ts";
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
    const mtime = new Date(entity.mtime ?? Date.now())?.getTime().toString(16);
    const size = entity.size?.toString(16);
    return `"${size}-${mtime}"`;
  }

  function calcEntityTag(entity: Entity) {
    if (is.uint8Array(entity) && entity.length === 0) {
      return ETAG_EMPTY;
    } else if (is.string(entity)) {
      entity = utf8.encode(entity);
    } else if (is.arrayBuffer(entity)) {
      entity = new Uint8Array(entity);
    }

    const length = (entity as Uint8Array)?.length?.toString?.(ETAG_RADIX) ?? 0;
    const hash = digestSync(entity).slice(0, ETAG_LENGTH);

    return `"${length}-${hash}"`;
  }

  // and now we actually calculate the ETag...
  const hasFileInfo = isFileInfo(entity);
  const weak = opt.weak ?? hasFileInfo;
  const tag = (hasFileInfo || (hasFileInfo && opt.statTag))
    ? calcStatTag(entity as FileInfo)
    : calcEntityTag(entity as Uint8Array);

  return weak ? `W/${tag}` : tag;
}
/**
 * Decode an etag into the relevant file info.
 * @param etag The ETag to decode
 * @example ```ts
 * // continuing the example from etag.encode
 *
 * import * as etag from "https://deno.land/x/etag@0.0.1/mod.ts";
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
): Partial<DecodedStatTag> | Partial<DecodedEntityTag> {
  function decodeStatTag(value: string): Partial<DecodedStatTag> {
    const [size, time] = value.split("-").map((n: string | number) => (
      n = parseInt(n as string, ETAG_RADIX) as number, is.nan(n) ? 0 : n
    ));
    const mtime = new Date(time);
    return { size, mtime, hash: null };
  }

  function decodeEntityTag(value: string): Partial<DecodedEntityTag> {
    const [length, hash] = value.split("-");
    let size = parseInt(length, ETAG_RADIX);
    size = is.nan(size) ? 0 : size;
    return { size, hash, mtime: null };
  }

  etag = etag.trim();
  const weak = /^W\//.test(etag);
  const value = etag.replace(/^(?:W\/)?"(.*)"$/, "$1").trim();
  const isStatTag = value.split("-")[1].length <= ETAG_MTIME_LENGTH;

  return {
    weak,
    etag,
    ...(isStatTag ? decodeStatTag(value) : decodeEntityTag(value)),
  };
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
  const opt = is.boolean(options)
    ? { weak: Boolean(options), statTag: false }
    : { weak: false, statTag: false, ...(options ?? {}) };

  const etag = encode(entity, opt);
  const tags = value.split(/\s*,\s*/);
  return !tags.includes(etag);
}

export { ifNoneMatch as ifNoMatch };

const _default = encode;

interface ETag extends ETagMethods {
  /**
   * Calculate an ETag value for an entity. If the entity is `FileInfo`, then the
   * tag will default to a _weak_ ETag.  `options.weak` overrides any default
   * behavior in generating the tag.
   *
   * @param entity A string, Uint8Array, or file info to use to generate the ETag
   * @param options either a boolean - a shorthand way to set `options.weak` - or an object of type `{ weak?: boolean; statTag?: boolean; }`
   * @example ```ts
   * import * as etag from "https://deno.land/x/etag@0.0.1/mod.ts";
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
interface ETagMethods {
  /**
   * Calculate an ETag value for an entity. If the entity is `FileInfo`, then the
   * tag will default to a _weak_ ETag.  `options.weak` overrides any default
   * behavior in generating the tag.
   *
   * @param entity A string, Uint8Array, or file info to use to generate the ETag
   * @param options either a boolean - a shorthand way to set `options.weak` - or an object of type `{ weak?: boolean; statTag?: boolean; }`
   */
  encode(entity: Entity, options?: Options): string;

  /**
   * Decode an etag into the relevant file info.
   * @param etag The ETag to decode
   */
  decode(etag: string): Partial<DecodedStatTag> | Partial<DecodedEntityTag>;

  /**
   * Create middleware that will attempt to decode the response.body into
   * something that can be used to generate an `ETag` and add the `ETag` header to
   * the response.
   */
  factory<S extends State>(options?: Options): Middleware<S>;

  /**
   * A helper function that takes the value from the `If-Match` header and an
   * entity and returns `true` if the `ETag` for the entity matches the supplied
   * value, otherwise `false`.
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-Match
   */
  ifMatch(value: string, entity: Entity, options?: Options): boolean;

  /**
   * A helper function that takes the value from the `If-No-Match` header and
   * an entity and returns `false` if the `ETag` for the entity matches the
   * supplied value, otherwise `false`.
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-None-Match
   */
  ifNoneMatch(value: string, entity: Entity, options?: Options): boolean;

  readonly [Symbol.toStringTag]: string;
}

export default Object.assign<typeof _default, ETagMethods>(_default, {
  encode,
  decode,
  factory,
  ifMatch,
  ifNoneMatch,
  [Symbol.toStringTag]: "ETag",
}) as ETag;
