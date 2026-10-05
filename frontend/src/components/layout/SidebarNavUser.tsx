import { ChevronsUpDown, LogIn, LogOut } from 'lucide-react';
import { ChatUserAvatar } from '@/components/chats/ChatUserAvatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  displayNameFromUser,
  type PbUser,
} from '@/lib/pocketbase';

type SidebarNavUserProps = {
  user: PbUser | null;
  isSignedIn: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
};

/**
 * Footer identity control — same shape as shadcn's NavUser block:
 * avatar + name/email + chevrons, with a dropdown for account actions.
 */
export function SidebarNavUser({
  user,
  isSignedIn,
  onSignIn,
  onSignOut,
}: SidebarNavUserProps) {
  const { isMobile } = useSidebar();

  if (!isSignedIn || !user) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            tooltip="Sign in to Chats"
            onClick={onSignIn}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <LogIn className="size-4" />
            </span>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">Sign in</span>
              <span className="truncate text-xs text-muted-foreground">
                Chats account
              </span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  const name = displayNameFromUser(user);
  const email = user.email?.trim() || '';

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              tooltip={name}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <ChatUserAvatar name={name} size="lg" />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {email}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <ChatUserAvatar name={name} size="lg" />
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onSignOut}>
              <LogOut />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
