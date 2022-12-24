<div align="center">

# [![deno911/etag - deno utilities for handling etags](https://migo.deno.dev/img.png?titleFontFamily=Inter&titleFontSize=96&titleFontWeight=900&&titleTextAnchor=left&titleX=80&titleY=183&subtitleFontSize=48&subtitleFontWeight=900&subtitleFontFamily=monospace&subtitleTextAnchor=left&subtitleX=450&subtitleY=178&width=1000&height=300&bgColor=123456&titleColor=4ac&subtitleColor=fff&iconW=150&iconH=150&iconX=285&iconY=70&borderRadius=20&icon=openmoji:t-rex&pxRatio=1.5&title=etag&subtitle=deno.land%2Fx%2Fetag)](https://deno.land/x/etag)

```ts
import etag from "https://deno.land/x/etag@0.0.2/mod.ts";
```

[**`encode`**](#encode)  ·  [**`decode`**](#decode)  · 
[**examples**](#examples)  ·  [**contributing**](#contributing)

<br>

</div>

## API

### `etag()`

The `encode` method is also exposed as the default export, for convenience.

The other API methods, including `encode`, `decode`, `ifMatch`, and `ifNoMatch`,
are defined as properties of the default export. Meaning it can be used as a
function and also an object:

```ts
import etag from "https://deno.land/x/etag@0.0.2/mod.ts";

etag(entity, options); // encode a tag for entity

etag.encode(entity); // same as etag(entity)
// ... see below for details on other API methods
```

> See what we did there? We only imported `etag`, and it makes sense to see it
> used functionally.... but we're also using it as we would in a namespace
> (`import * as etag`). 🧐

### `encode`

```ts
etag.encode(entity: string | ArrayBuffer | Uint8Array | FileInfo);
```

### `decode`

```ts
etag.decode(etag: string);
```

### `ifMatch`

```ts
etag.ifMatch();
```

> **Note**: Also exposed as etag.match()

### `ifNoMatch`

```ts
etag.ifNoMatch();
```

> **Note**: also accessible as `etag.ifNoneMatch`

---

## Examples

### Encoding

Here's a basic example of returning a Response body with a weak eTag attached:

#### Using it as a Response Header

```ts
return new Response(body, {
  headers: {
    "etag": etag(body),
    // ≈ etag.encode(body)
  },
});
```

#### Creating a weak tag for a Blob

```ts
const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" />']);

etag(svg, false);
// ≈ etag.encode(svg, { weak: false })
```

### Decoding

### Server Middleware

The `factory` function exported in `mod.ts` is a quick and easy way to add ETag
support to a project running on the Oak server framework. It probably supports
other frameworks as well, but I haven't had the chance to investigate that yet.

```ts
app.use("/:img.png", etag.factory);
```

How's it work? The factory function returns a closure which receives the
application context object, giving it the ability to intercept and modify
headers on every request/response.

Register the factory as a middleware with your framework, define a specific URL
pattern for it to be triggered on, and a deterministic ETag will be generated
and injected into the response headers for all requests that match its
registered pattern.

---

## Contributing

### ⚠️ Fixing a bug? Create an Issue first!

> Unless, of course, you're fixing a bug for which an issue already exists!

This allows the issue to be connected to your Pull Request, creating a permanent
record of your contribution to the project. It also makes it easier for
maintainers to track project progression.

## Creating an issue also ensures you're given proper credit for fixing the bug.

> This section assumes you have [**the GitHub CLI**](https://cli.github.com).
> You definitely _**should**_ have it.

### Fork and clone the repository locally

```sh
gh repo fork deno911/etag --clone
```

### Create a new branch for your changes

```sh
git checkout -b fix/typo-in-readme
```

### Make small changes and concise commits

```sh
# hack hack hack...

git commit README.md -m "fix: typos in README.md" && git push
```

> **Note**: keep the scope of your changes relevant and concise.

### Open a Pull Request

```sh
gh pr create --title "fix: typos in README.md"
```

**Or just open your repo on GitHub.com and follow the prompts.**

> **Warning**: make sure you select the upstream repo for your PR!

<br>

---

<div align="center">

### [🅓🅔🅝🅞⑨①①][deno911]

</div>

[deno.land]: https://deno.land "Deno.land - Official Module Registry"
[nest.land]: https://nest.land "Nest.land - Immutable Module Registry"
[Arweave blockchain]: https://arweave.org "Arweave Blockchain"
[deno911]: https://github.com/deno911 "Projects by deno911 on GitHub"
