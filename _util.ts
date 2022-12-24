import {
  assert,
  base64,
  crypto,
  ERR_STREAM_ALREADY_FINISHED,
  ERR_STREAM_DESTROYED,
  is,
  Stats,
  statSync,
} from "./deps.ts";

import type {
  Context,
  DigestAlgorithm,
  Entity,
  FileInfo,
  State,
  VirtualFileInfo,
  VirtualFsFile,
} from "./mod.d.ts";

export { assert, is };

export const ETAG_EMPTY = `"0-2jmj7l5rSw0yVb/vlWAYkK/YBwk="`;
export const ETAG_LENGTH = 27, ETAG_RADIX = 16, ETAG_MTIME_LENGTH = 12;

import type { DecodedEntityTag, DecodedStatTag } from "./mod.d.ts";

export function decodeStatTag(value: string): Partial<DecodedStatTag> {
  const [size, time] = value.split("-").map((n: string | number) => (
    n = parseInt(n as string, ETAG_RADIX) as number, is.nan(n) ? 0 : n
  ));
  const mtime = new Date(time);
  return { size, mtime, hash: undefined };
}

export function decodeEntityTag(value: string): Partial<DecodedEntityTag> {
  const [length, hash] = value.split("-");
  let size = parseInt(length, ETAG_RADIX);
  if (is.nan(size)) size = 0;
  return { size, hash, mtime: undefined };
}

/** @internal */
export function digestSync(
  entity: Entity,
  DigestAlgorithm: DigestAlgorithm = "SHA-1",
): string {
  /** @internal */
  function validateEntity(entity: Entity): Uint8Array {
    if (is.uint8Array(entity) || is.arrayBuffer(entity)) {
      return entity as Uint8Array;
    } else if (is.string(entity)) {
      // encode as (utf-8) Uint8Array
      return new TextEncoder().encode(entity);
    }

    assert(
      !is.nullOrUndefined(entity),
      "Entity cannot be null or undefined!",
      entity,
    );

    return entity as any;
  }

  const toHex = (v: number) => v.toString(16).padStart(2, "0");

  const buffer = validateEntity(entity);
  const hash = crypto.subtle.digestSync(DigestAlgorithm, buffer);

  return base64.encode(Array.from(new Uint8Array(hash), toHex).join(""));
}

export function digest(
  entity: Entity,
  DigestAlgorithm: DigestAlgorithm = "SHA-1",
): Promise<string> {
  return Promise.resolve(digestSync(entity, DigestAlgorithm));
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
    && "ino" in obj
    && "size" in obj
    && "mtime" in obj
    && "ctime" in obj
    && is.any(is.number, obj.ino, obj.size)
    && is.any([is.date, is.string, is.number], obj.mtime)
    && is.number((obj as any).size);
}

/** @internal */
export function fstatSync<
  T extends VirtualFsFile["rid"] | VirtualFsFile,
>(file: T): VirtualFileInfo;

/** @internal */
export function fstatSync(file: Deno.FsFile): FileInfo;

/** @internal */
export function fstatSync(file: string | URL | Stats): Partial<FileInfo>;

/** @internal */
export function fstatSync(file: any): any | undefined {
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
export function fstat(
  file:
    | (string | URL | Stats)
    | Deno.FsFile
    | (number | VirtualFsFile)
    | FileInfo,
): Promise<ReturnType<typeof fstatSync>> {
  try {
    return Promise.resolve(fstatSync(file as any));
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
export async function getEntity<T extends Response | BodyInit>(
  res: T,
): Promise<Entity>;

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
          throw new ERR_STREAM_ALREADY_FINISHED("getEntity(ctx.arrayBuffer)");
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
    throw new TypeError(
      `Unable to determine entity body from given context!`,
      { cause },
    );
  }
}

/**
 * noop!
 */
export const noop = () => {};
