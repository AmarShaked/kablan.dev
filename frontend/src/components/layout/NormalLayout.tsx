import { Outlet } from 'react-router-dom';
import { DevBanner } from '@/components/DevBanner';
import { Navbar } from '@/components/layout/Navbar';
import { DesktopUpdateBanner } from '@/components/DesktopUpdateBanner';

export function NormalLayout() {
  return (
    <>
      <div className="flex flex-col h-screen">
        <DevBanner />
        <DesktopUpdateBanner />
        {/* The task view no longer goes full-screen for a pane, so the navbar always stays. */}
        <Navbar />
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </div>
    </>
  );
}
