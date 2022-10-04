#!/usr/bin/env -S deno run --allow-read --allow-write

/// <reference no-default-lib="true" />
/// <reference lib="deno.ns" />
/// <reference lib="deno.window" />
/// <reference lib="esnext" />

export const VERSION = "0.0.0";

/**
 * `prepublish` hook: invoked before publish.
 */
export async function prepublish(version: string) {
  // await bump("./{README.md,LICENSE}", version);
  // return false; // return a falsey value to prevent publishing.
}

/**
 * `postpublish` hook: invoked after publish.
 */
export function postpublish(version: string) {
  console.log("✓ successfully published %s to deno.land", version);
}
