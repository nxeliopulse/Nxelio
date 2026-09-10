// Test-only stand-in for Next.js's `server-only` marker module.
//
// `import "server-only"` is a build-time guard: it makes the bundler fail if a
// server module is ever pulled into client code. It has no runtime behaviour
// and is not resolvable outside a Next build, which previously meant any
// module carrying that guard could not be unit-tested at all. ts-path-loader
// maps the specifier here so those modules load under plain `node --test`.
export {};
