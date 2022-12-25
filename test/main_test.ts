import "./deps.ts";
import etag from "../mod.ts";
import { is } from "../_util.ts";

describe("etag module default import", () => {
  it("should generate a deterministic eTag", () =>
    assertEquals(etag("deno911"), '"7-MjJkMWZlOWM5ZDFmOWI3OGQ0YzR"'));

  it("should also encode with the .encode method", () =>
    assertEquals(etag.encode("deno911"), '"7-MjJkMWZlOWM5ZDFmOWI3OGQ0YzR"'));

  it("should return [object ETag] for its toStringTag", () =>
    assertEquals({}.toString.call(etag), "[object ETag]"));

  it("should have callable methods", () => {
    assertEquals(is(etag.encode), "Function");
    assertEquals(is(etag.decode), "Function");
    assertEquals(is(etag.ifMatch), "Function");
    assertEquals(is(etag.ifNoneMatch), "Function");
    assertEquals(is(etag.factory), "Function");
  });
});
