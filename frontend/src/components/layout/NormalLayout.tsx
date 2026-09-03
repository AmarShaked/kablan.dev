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
        <div className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </div>
      </SidebarInset>
      {/* Outside the inset, so it runs the full height of the window like the sidebar opposite
          it — the header belongs to the page between them, not to either edge. */}
      <RightRail />
    </SidebarProvider>
  );
}
