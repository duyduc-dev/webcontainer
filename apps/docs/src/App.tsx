import { Route, Routes } from 'react-router';
import Layout from './components/Layout';
import DocsLayout from './docs/DocsLayout';
import CrossOriginIsolation from './docs/pages/CrossOriginIsolation';
import Filesystem from './docs/pages/Filesystem';
import Installation from './docs/pages/Installation';
import Introduction from './docs/pages/Introduction';
import NodeBuiltins from './docs/pages/NodeBuiltins';
import Preview from './docs/pages/Preview';
import Process from './docs/pages/Process';
import Shell from './docs/pages/Shell';
import StatusPage from './docs/pages/StatusPage';
import Home from './pages/Home';

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route element={<DocsLayout />} path="docs">
          <Route index element={<Introduction />} />
          <Route element={<Installation />} path="installation" />
          <Route element={<Filesystem />} path="filesystem" />
          <Route element={<Process />} path="process" />
          <Route element={<Shell />} path="shell" />
          <Route element={<Preview />} path="preview" />
          <Route element={<NodeBuiltins />} path="node-builtins" />
          <Route element={<CrossOriginIsolation />} path="cross-origin-isolation" />
          <Route element={<StatusPage />} path="status" />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
