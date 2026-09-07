import Architecture from './components/Architecture';
import Capabilities from './components/Capabilities';
import Footer from './components/Footer';
import Hero from './components/Hero';
import Quickstart from './components/Quickstart';
import Status from './components/Status';
import Topbar from './components/Topbar';
import Verified from './components/Verified';

function App() {
  return (
    <>
      <Topbar />
      <Hero />
      <Architecture />
      <Capabilities />
      <Verified />
      <Quickstart />
      <Status />
      <Footer />
    </>
  );
}

export default App;
