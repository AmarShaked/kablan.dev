import type { CSSProperties } from 'react';
import { Outlet } from 'react-router-dom';
import { ProjectHeader } from '@/components/layout/ProjectHeader';
import { ProjectsSidebar } from '@/components/layout/ProjectsSidebar';
import { RightRail } from '@/components/layout/RightRail';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

export function NormalLayout() {
  return (
    <SidebarProvider
      className="h-svh overflow-hidden"
      style={{ '--sidebar-width': '15rem' } as CSSProperties}
    >
      <ProjectsSidebar />
      <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
        <ProjectHeader />
        {/* The rail sits beside the page rather than inside it, so it stays put whatever the
            middle of the screen is doing — and below the header, which spans the whole width. */}
        <div className="flex min-h-0 flex-1">
          <div className="min-h-0 min-w-0 flex-1 overflow-auto">
            <Outlet />
          </div>
          <RightRail />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
