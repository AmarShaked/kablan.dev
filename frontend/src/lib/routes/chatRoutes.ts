export function isChatsPath(pathname: string): boolean {
  return pathname === '/chats' || pathname.startsWith('/chats/');
}
