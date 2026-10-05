import { useEffect, useState } from 'react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { Loader2 } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePocketBaseAuth } from '@/hooks/usePocketBaseAuth';
import { defineModal, getErrorMessage, type NoProps } from '@/lib/modals';
import {
  ChatInviteError,
  findOrCreateDmByEmail,
  type PbChatListItem,
} from '@/lib/pocketbase';

export type InviteChatResult =
  | { action: 'opened'; chat: PbChatListItem }
  | { action: 'canceled' };

const InviteChatDialogImpl = NiceModal.create<NoProps>(() => {
  const modal = useModal();
  const { pb } = usePocketBaseAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!modal.visible) return;
    setEmail('');
    setError(null);
    setBusy(false);
  }, [modal.visible]);

  const close = () => {
    modal.resolve({ action: 'canceled' } as InviteChatResult);
    modal.hide();
  };

  const submit = async () => {
    if (!pb) {
      setError('PocketBase is not configured.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const chat = await findOrCreateDmByEmail(pb, email);
      modal.resolve({ action: 'opened', chat } as InviteChatResult);
      modal.hide();
    } catch (err) {
      if (err instanceof ChatInviteError) {
        setError(err.message);
      } else {
        setError(getErrorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={modal.visible} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start a chat</DialogTitle>
          <DialogDescription>
            Enter the email of someone who already has a Chats account. We’ll
            open a direct message with them — or the existing one if you’ve
            talked before.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="invite-chat-email">Email</Label>
            <Input
              id="invite-chat-email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="colleague@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy || !email.trim()}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Open chat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export const InviteChatDialog = defineModal<void, InviteChatResult>(
  InviteChatDialogImpl
);
