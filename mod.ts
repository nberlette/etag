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

import {
  calcEntityTag,
  calcStatTag,
  ETAG_MTIME_LENGTH,
  ETAG_RADIX,
  getEntity,
  is,
  isFileInfo,
} from "./helpers.ts";

import type {
  Context,
  DecodedEntityTag,
  DecodedStatTag,
  ETagOptions,
  FileInfo,
  Middleware,
  State,
} from "./mod.d.ts";

export * from "./mod.d.ts";

/**
 * Calculate an ETag value for an entity. If the entity is `FileInfo`, then the
 * tag will default to a _weak_ ETag.  `options.weak` overrides any default
 * behavior in generating the tag.
 *
 * @param entity A string, Uint8Array, or file info to use to generate the ETag
 * @param options
 */
export function encode(
  entity: string | ArrayBuffer | Uint8Array | FileInfo,
  options: ETagOptions = {
    weak: false,
  },
): string {
  // and now we actually calculate the ETag...
  const hasFileInfo = isFileInfo(entity);
  const weak = options.weak ?? hasFileInfo;
  const tag = (hasFileInfo || (hasFileInfo && options.statTag))
    ? calcStatTag(entity as FileInfo)
    : calcEntityTag(entity as Uint8Array);
  return weak ? `W/${tag}` : tag;
}

/**
 * Decode an etag into the relevant file info.
 * @param etag The ETag to decode
 * @example ```ts
 * import * as etag from "https://deno.land/x/etag@0.0.1/mod.ts";
 * import { glob } from "./src/fs.ts";
 *
 * let i = 1;
 * for await (const f of glob("./src/*.ts")) {
 *   console.log("%d. %s", i, f.name);
 *   const stat = await Deno.stat(f.path);
 *   const tag = await etag.encode(stat, { statTag: true });
 *   const decoded = await etag.decode(tag);
 *   console.log("  stat:\n\t%s", JSON.stringify(stat,null,2));
 *   console.log("  decoded:\n\t%s\n", JSON.stringify(decoded, null, 2));
 *   i++;
 * }
 * ```
 */
export function decode(
  etag: `W/${string}` | (string & {}),
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
  options?: ETagOptions,
): Middleware<S> {
  return async function etag(ctx: Context<S>, next) {
    next();
    if (!ctx.response.headers.has("ETag")) {
      const entity = await getEntity(ctx);
      if (entity) {
        ctx.response.headers
          .set("ETag", encode(entity, options));
      }
    }
  };
}

/**
 * A helper function that takes the value from the `If-Match` header and an
 * entity and returns `true` if the `ETag` for the entity matches the supplied
 * value, otherwise `false`.
 *
 * See MDN's [`If-Match`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-Match)
 * article for more information on how to use this function.
 */
export function ifMatch(
  value: string,
  entity: string | Uint8Array | FileInfo,
  options: ETagOptions = {},
): boolean {
  const etag = encode(entity, options);
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
 * See MDN's [`If-None-Match`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-None-Match) article for more information on how to use this function.
 */
export function ifNoneMatch(
  value: string,
  entity: string | Uint8Array | FileInfo,
  options: ETagOptions = {},
): boolean {
  if (value.trim() === "*") {
    return false;
  }
  const etag = encode(entity, options);
  const tags = value.split(/\s*,\s*/);
  return !tags.includes(etag);
}

export { ifNoneMatch as ifNoMatch };
