// deno-lint-ignore-file ban-types
/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="deno.ns" />
/// <reference lib="deno.window" />

import type { Stats } from "./deps.ts";

export type { AssertionError, DigestAlgorithm, Stats } from "./deps.ts";

export type Maybe<T> = T | null | undefined;

export type Arrayable<T> = T | T[];

export type Entity = string | ArrayBuffer | Uint8Array | Stats | FileInfo;

/**
 * Matches a `class` constructor.
 * @see https://mdn.io/Classes.
 */
export type Class<T = unknown, Arguments extends any[] = any[]> = new (
  ...args: Arguments
) => T;

type Id<T extends {}> = T extends infer U ? {
    [K in keyof U]: U[K] extends object ? Id<U[K]> : U[K];
  }
  : never;

export interface ETagOptions {
  /**
   * Force the module to generate a weak eTag, which are prefixed with `W/`.
   * Weak tags are recommended for *most* use cases, preventing unnecessary
   * cache invalidation. For strong eTags, the cache can be busted from only
   * **one byte** being a mismatch to the original!
   * @default false
   */
  weak?: boolean;
  /**
   * Force the `ETag` to be calculated from file stats rather than a hash of
   * the given entity's contents.
   * @default false
   */
  statTag?: boolean;
}

export type Options = Maybe<boolean | ETagOptions>;

export type Middleware<S = unknown> = (
  context: Context<S>,
  next: Fn<State, [Context]>,
) => Promise<void>;

export interface Context<S = unknown, T = "express"> {
  request: Request;
  response: Response;
  state: State;
}

export type State<K = string | number | symbol, V = any> = Record<K, V>;

/**
 * Future support for virtual files
 */
export interface VirtualFileInfo {
  isFile: boolean;
  isDirectory: boolean;
  ctime: string | number | Date;
  mtime: string | number | Date;
  size: number;
}

export interface VirtualFsFile {
  rid: number;
  name: string;
  path: string;
  body: Entity;
  meta: VirtualFileInfo;
}

/** Properties shared by both statTags and entityTags alike. */
interface DecodedBaseTag {
  weak: boolean;
  etag: string;
}

/**
 * Properties unique to the decoded statTag interface. StatTags are generated
 * for objects that exhibit characteristics of the `Deno.FileInfo` interface,
 * specifically objects that have properties named `mtime`, `size`,
 */
export interface DecodedStatTag extends DecodedBaseTag, FileInfo {
  hash: null;
}

export type DecodedEntityTag = Id<
  DecodedBaseTag & FileInfo & {
    hash: string;
    mtime: null;
  }
>;

export type Timestamp<Parsed = false> = Maybe<
  Parsed extends true ? Date : Date | string | number
>;

export type Id<U extends {}> = U extends infer T extends object ? {
    -readonly [K in keyof T]-?: T[K] extends Record<string, string> ? Id<T[K]>
      : T[K];
  }
  : never;

export type Noop<T> = T;

/**
 * Partial implementation of the Deno.FileInfo interface. Describes a file,
 * and is returned by `stat`, `lstat`, `statSync`, `lstatSync`.
 *
 * @category File System
 * @see {@link Deno.FileInfo}
 */
export type FileInfo<Parsed = false> = Id<
  & {
    /**
     * The size of the file, in bytes.
     */
    size: number;
    /**
     * The last modification time of the file. This corresponds to the `mtime`
     * field from `stat` on Linux/Mac OS and `ftLastWriteTime` on Windows. This
     * may not be available on all platforms.
     */
    mtime: Timestamp<Parsed>;
    /**
     * The creation time of the file. This corresponds to the `birthtime`
     * field from `stat` on Mac/BSD and `ftCreationTime` on Windows. This may
     * not be available on all platforms.
     */
    birthtime: Timestamp<Parsed>;
    /**
     * Inode number.
     *
     * _Linux/Mac OS only._
     */
    ino: Maybe<number>;
  }
  & Partial<{
    /**
     * The last access time of the file. This corresponds to the `atime`
     * field from `stat` on Unix and `ftLastAccessTime` on Windows. This may not
     * be available on all platforms.
     */
    atime: Timestamp<Parsed>;
    /**
     * ID of the device containing the file.
     *
     * _Linux/Mac OS only._
     */
    dev: Maybe<number>;
    /**
     * **UNSTABLE**: Match behavior with Go on Windows for `mode`.
     *
     * The underlying raw `st_mode` bits that contain the standard Unix
     * permissions for this file/directory.
     */
    mode: Maybe<number>;
    /**
     * Number of hard links pointing to this file.
     *
     * _Linux/Mac OS only._
     */
    nlink: Maybe<number>;
    /**
     * User ID of the owner of this file.
     *
     * _Linux/Mac OS only._
     */
    uid: Maybe<number>;
    /**
     * Group ID of the owner of this file.
     *
     * _Linux/Mac OS only._
     */
    gid: Maybe<number>;
    /**
     * Device ID of this file.
     *
     * _Linux/Mac OS only._
     */
    rdev: Maybe<number>;
    /**
     * Blocksize for filesystem I/O.
     *
     * _Linux/Mac OS only._
     */
    blksize: Maybe<number>;
    /**
     * Number of blocks allocated to the file, in 512-byte units.
     *
     * _Linux/Mac OS only._
     */
    blocks: Maybe<number>;
  }>
>;
