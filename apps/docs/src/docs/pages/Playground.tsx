import NodePlayground from '../components/playground/NodePlayground';
import ReactVitePlayground from '../components/playground/ReactVitePlayground';
import DocPage from '../components/DocPage';

function Playground() {
  return (
    <DocPage
      title="Playground"
      lede="A real duckwc sandbox, booted on this page. Edit any file and it restarts automatically, like a dev server — require('./greeting') resolves between files exactly like it would in your own app, running in a Web Worker and previewed live on the right."
      wide
    >
      <NodePlayground />
      <ReactVitePlayground />
    </DocPage>
  );
}

export default Playground;
