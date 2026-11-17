// Whether doc-extraction-util (the optional peer for lessons) can be loaded from here: installed
// in this package, or in a parent's node_modules (e.g. an app that has the harness in deps/).
export function hasExtractor() {
  try {
    import.meta.resolve("doc-extraction-util");
    return true;
  } catch {
    return false;
  }
}
