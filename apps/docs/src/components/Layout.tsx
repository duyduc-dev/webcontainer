import { Outlet } from 'react-router';
import Topbar from './Topbar';

function Layout() {
  return (
    <>
      <Topbar />
      <Outlet />
    </>
  );
}

export default Layout;
