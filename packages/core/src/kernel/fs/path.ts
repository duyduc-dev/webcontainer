/** All paths are treated as absolute against the VFS root, regardless of a leading "/". */
const normalize = (path: string): string => {
  const parts = path.split("/").filter((segment) => segment.length > 0 && segment !== ".");

  const stack: string[] = [];
  for (const segment of parts) {
    if (segment === "..") stack.pop();
    else stack.push(segment);
  }

  return `/${stack.join("/")}`;
};

const dirname = (path: string): string => {
  const normalized = normalize(path);
  const index = normalized.lastIndexOf("/");
  return index <= 0 ? "/" : normalized.slice(0, index);
};

const basename = (path: string): string => {
  const normalized = normalize(path);
  return normalized.slice(normalized.lastIndexOf("/") + 1);
};

const segments = (path: string): string[] => {
  const normalized = normalize(path);
  return normalized === "/" ? [] : normalized.slice(1).split("/");
};

export { basename, dirname, normalize, segments };
