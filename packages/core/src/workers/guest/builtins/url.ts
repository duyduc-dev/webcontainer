// A POSIX-only subset of Node's `url` module: fileURLToPath/pathToFileURL
// for the "resolve a path relative to import.meta.url" pattern real packages
// use, plus a legacy parse()/format() good enough for common usage — not
// byte-for-byte identical to Node in every edge case (same philosophy as
// path.ts). `URL`/`URLSearchParams` are re-exported from the Worker global,
// where they already exist as real Web APIs.

function fileURLToPath(url: string | URL): string {
  const href = typeof url === "string" ? url : url.href;
  if (!href.startsWith("file://")) {
    throw new TypeError(`URL must be of scheme file: ${href}`);
  }
  return decodeURIComponent(href.slice("file://".length));
}

function pathToFileURL(path: string): URL {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return new URL(`file://${encoded}`);
}

type LegacyParsedUrl = {
  protocol: string | null;
  host: string | null;
  hostname: string | null;
  port: string | null;
  pathname: string;
  search: string;
  query: string;
  hash: string;
  href: string;
};

function parse(input: string): LegacyParsedUrl {
  try {
    const u = new URL(input);
    return {
      protocol: u.protocol,
      host: u.host || null,
      hostname: u.hostname || null,
      port: u.port || null,
      pathname: u.pathname,
      search: u.search,
      query: u.search ? u.search.slice(1) : "",
      hash: u.hash,
      href: u.href,
    };
  } catch {
    // Not an absolute URL (e.g. a bare path) — Node's legacy parser treats
    // this as pathname-only rather than throwing.
    const [beforeHash, hash = ""] = input.split("#");
    const [pathname, search = ""] = beforeHash.split("?");
    return {
      protocol: null,
      host: null,
      hostname: null,
      port: null,
      pathname,
      search: search ? `?${search}` : "",
      query: search,
      hash: hash ? `#${hash}` : "",
      href: input,
    };
  }
}

function format(urlObject: Partial<LegacyParsedUrl> | URL): string {
  if (urlObject instanceof URL) return urlObject.href;
  const { protocol = "", host = "", pathname = "", search = "", hash = "" } = urlObject;
  const proto = protocol ? `${protocol}//` : "";
  return `${proto}${host ?? ""}${pathname ?? ""}${search ?? ""}${hash ?? ""}`;
}

function resolve(from: string, to: string): string {
  return new URL(to, from).href;
}

export default {
  URL,
  URLSearchParams,
  fileURLToPath,
  pathToFileURL,
  parse,
  format,
  resolve,
};
