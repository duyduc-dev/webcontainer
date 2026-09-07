import CodeBlock from '../components/CodeBlock';
import DocPage from '../components/DocPage';

function Filesystem() {
  return (
    <DocPage title="Filesystem" lede="dwc.fs — an in-memory virtual filesystem, promise-based.">
      <CodeBlock>
        {`mkdir(path, { recursive? })
writeFile(path, contents: string | Uint8Array)
readFile(path): Promise<Uint8Array>
readdir(path): Promise<string[]>
stat(path) / lstat(path): Promise<StatResult>   // isFile()/isDirectory()/isSymbolicLink()/size/mode/mtimeMs
chmod(path, mode)
symlink(target, path) / readlink(path) / realpath(path)
rm(path, { recursive? })
rename(from, to)
exists(path): Promise<boolean>
mount(tree: FileSystemTree, basePath?)   // seed a directory tree in one call`}
      </CodeBlock>
      <p>
        All calls are promise-based and throw <code>FSError</code> (<code>.code</code> —{' '}
        <code>ENOENT</code>, <code>EEXIST</code>, <code>ENOTDIR</code>, <code>EISDIR</code>, <code>ENOTEMPTY</code>,{' '}
        <code>EINVAL</code> — and <code>.path</code>) on failure.
      </p>
      <h2>Example</h2>
      <CodeBlock>
        {`await dwc.fs.mkdir("/project", { recursive: true });
await dwc.fs.writeFile("/project/hello.txt", "hello world");
const contents = await dwc.fs.readFile("/project/hello.txt");
new TextDecoder().decode(contents); // "hello world"

try {
  await dwc.fs.readFile("/does-not-exist");
} catch (err) {
  err.code; // "ENOENT"
}`}
      </CodeBlock>
    </DocPage>
  );
}

export default Filesystem;
