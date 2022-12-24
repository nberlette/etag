#!/usr/bin/env -S deno run --allow-read --allow-write

/// <reference no-default-lib="true" />
/// <reference lib="deno.ns" />
/// <reference lib="deno.window" />
/// <reference lib="esnext" />

import type { ExpandGlobOptions } from "https://deno.land/std@0.167.0/fs/mod.ts";
import { $, assert, colors, is, JSONC, semver, TOML, YAML } from "./deps.ts";

const ansi = colors();
const DEBUG = !["false", null, undefined].includes(Deno.env.get("DEBUG"));
const preventPublishOnError = false;

export const VERSION = "0.0.1";
export const MODULE = "etag";

/** `prepublish` will be invoked before publish */
export async function prepublish(version: string) {
  const glob = $.fs.expandGlob.bind($);

  for await (const file of glob("./*.{md,ts}")) {
    try {
      if (file.isFile) {
        await bump(file.path, { version }).catch(console.error);
      }
    } catch (err) {
      console.error(err);
      if (preventPublishOnError) return false;
    }
  }

  try {
    // and link our nest api key from the environment
    const NESTAPIKEY = Deno.env.get("NESTAPIKEY");
    const egg = find<{
      version: string;
      [x: string]: JSONC.JSONValue;
    }>("./egg.*");

    // sanity check
    if (!is.nullish(egg?.path) && egg?.parsed) {
      if (is.nonEmptyStringAndNotWhitespace(NESTAPIKEY)) {
        // ensure eggs is installed (implicit latest version)
        exec(Deno.execPath(), "install -A https://deno.land/x/eggs/cli.ts");
        //
        exec("eggs", `link ${NESTAPIKEY}`);

        if (semver.lt(egg.parsed.version!, version)) {
          egg.parsed.version = version;
          const stringify = (egg.path.endsWith("json")
            ? JSON.stringify
            : egg.path.endsWith("toml")
            ? TOML.stringify
            : YAML.stringify);
          Deno.writeTextFileSync(
            egg.path,
            Reflect.apply(
              stringify,
              undefined,
              stringify === JSON.stringify
                ? [egg.parsed, null, 2]
                : [egg.parsed],
            ),
          );
        }
        exec("eggs", "publish");
      } else {
        throw new TypeError(
          `Missing environment variable \`NESTAPIKEY\`, which is required to publish on ${
            ansi.bold.magenta("nest.land")
          }. Please set it and try again.`,
        );
      }
    }
  } catch (err) {
    console.error(err);
    if (preventPublishOnError) return false;
  }

  if (DEBUG) return false; // return a falsey value to prevent publishing.
}

/** `postpublish` will be invoked after publish */
export function postpublish(version: string) {
  console.log(
    ansi.bold.brightGreen(
      ` ✓ published ${ansi.green.underline(`${MODULE}@${version}`)}`,
    ),
  );
}

type Arrayable<T> = T | T[];

interface BumpContext {
  version?: string | semver.SemVer;
  previous?: string | semver.SemVer;
  semver: {
    releaseType: semver.ReleaseType;
    includePrelease?: boolean;
    operator?: semver.Operator;
  };
  options?: {
    failFast?: boolean;
    placeholder?: string;
    placeholders?: boolean | string | RegExp;
    delimiter?: string | RegExp;
    jsdoc?: boolean | Arrayable<string | RegExp>;
  };
}
const releaseType: semver.ReleaseType = "patch";
const defaultBumpContext: BumpContext = {
  version: semver.increment(VERSION ?? "0.0.0", releaseType) ?? "",
  semver: {
    releaseType: "patch",
  },
  options: {
    delimiter: `[\\/\"\'\\(\\)\\{\\}\\[\\]\\s]`,
    placeholder: "VERSION",
    placeholders: `\\{<v>\\}|\\{\\{<v>\\}\\}|\\$<v>`,
    jsdoc: [
      "@version ",
      `@module ${MODULE}@`,
    ],
  },
};
async function bump(
  path: string | URL,
  ctx?: Partial<BumpContext>,
): Promise<void>;
async function bump(
  path: string | URL,
  version?: string,
  ctx?: Partial<BumpContext>,
): Promise<void>;

async function bump(
  path: string | URL,
  version?: string | Partial<BumpContext>,
  ctx: Partial<BumpContext> = { ...defaultBumpContext },
): Promise<void> {
  const { semver: { releaseType }, options } = {
    ...defaultBumpContext,
    ...(ctx || {}),
  } as BumpContext;

  const _EXPORTED_VERSION_RE =
    /^\s*(?<exported>export|)[ ]*(?<variable_type>const|let|var)[\t\s ]+(?<variable>\w+)[\s\t ]*=[\s\t ]*(?<quote>["'])(?<value>[^'"]+?)(?:['"][;]?)/m;

  const previous = ctx?.previous ?? VERSION ?? "0.0.0";

  if (!is.nonEmptyStringAndNotWhitespace(version)) {
    version = semver.increment(previous, releaseType) ?? "";

    assert.nonEmptyStringAndNotWhitespace(version);
  }

  path = String(path);
  const filename = $.path.basename(path);

  try {
    const PLACEHOLDER_RE = /[%#]\w+|[<]\w+?[>]/ig;
    const PLACEHOLDERS = (
      options?.placeholders === true
        ? defaultBumpContext.options?.placeholders
        : options?.placeholders === false
        ? ""
        : is.regExp(options?.placeholders)
        ? options?.placeholders.source
        : [options?.placeholders ?? ""].flat().flatMap((s) => s.split(/\b\|\b/))
          .map((s) =>
            s.replaceAll(PLACEHOLDER_RE, options?.placeholder ?? "VERSION")
          ).join("|")
    ) as string;

    //
    // normalize our delimiter
    const DELIM = String(options?.delimiter);
    const JSDOC = is.nonEmptyArray(options?.jsdoc) ? options?.jsdoc! : [];
    const SPECIFIER_RE = new RegExp(
      // lookbehind
      `(?<=(?:^|${DELIM})(?:${MODULE}[@]${
        options?.jsdoc && JSDOC.length
          ? `|(?:^[\\t ]+\\* |\\s)${JSDOC.join("|")}`
          : ""
      }))` +
        // placeholder tags, literal previous version, or any non-DELIM
        `(${
          PLACEHOLDERS ? PLACEHOLDERS + "|" : ""
        }${VERSION}|(?!${DELIM}).+?)` +
        // lookahead
        `(?=$|${DELIM})`,
      "mig",
    );
    let content = await Deno.readTextFile(path);

    if (SPECIFIER_RE.test(content)) {
      content = content.replaceAll(SPECIFIER_RE, version),
        await Deno.writeTextFile(path, content).catch(console.error);
    }
  } catch (error) {
    console.error(
      ansi.bold.bgRed(" FAILED "),
      `⚠︎ Unable to bump ${ansi.underline.red(filename)}${
        previous ? ` from ${ansi.underline(String(previous))}` : ""
      } to ${ansi.bold(version)}!\n\n${error}`,
    );
  }
}

interface FindResult<T = { [key: string]: JSONC.JSONValue }> {
  source: string;
  parsed: T | undefined;
  path: string;
}
function find<T = { [key: string]: JSONC.JSONValue }>(
  glob: string | URL,
  options: Omit<ExpandGlobOptions, "includeDirs" | "caseInsensitive"> = {},
): FindResult<T> | undefined {
  glob = $.path.normalizeGlob(String(glob));
  const candidates = [
    ...$.fs.expandGlobSync(glob, {
      ...options,
      includeDirs: false,
      caseInsensitive: true,
    }),
  ].filter((f) => f.isFile);
  const feelingLucky = candidates.at(0);

  try {
    const source = Deno.readTextFileSync(String(feelingLucky?.path));
    if (!source) return undefined;
    const ext = $.path.extname(feelingLucky?.path ?? "").replace(/^\./, "");

    let parsed: T | undefined = undefined;
    const path = feelingLucky?.path ?? "";

    switch (ext) {
      case ".json":
        parsed = JSONC.parse(source, { allowTrailingComma: true }) as T ??
          undefined;
        break;
      case ".yaml":/* fallthrough */
      case ".yml":
        parsed = YAML.parse(source) as T ?? undefined;
        break;
      case ".toml":
        parsed = TOML.parse(source) as T ?? undefined;
        break;
      default:
        return undefined;
    }

    return { source, parsed, path };
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
    return undefined;
  }
}

function exec<
  Env extends Record<string, string>,
  Cmd extends string[] = string[],
>(env: Env, ...cmd: Cmd): Promise<string>;

function exec<
  Cmd extends string[] = string[],
>(...cmd: Cmd): Promise<string>;

function exec(
  env: string | Record<string, string>,
  ...cmd: string[]
): Promise<string> {
  if (is.string(env)) {
    cmd.unshift(env);
    env = {} as Record<string, string>;
  }

  assert.plainObject(env);

  if (cmd.length === 1) {
    cmd = cmd[0].split(/\s+/, 2);
  }

  return Deno.run({
    cmd,
    env,
    stderr: "null",
    stdin: "null",
    stdout: "piped",
  }).output().then((output) => new TextDecoder().decode(output));
}

export { bump, exec, find };
