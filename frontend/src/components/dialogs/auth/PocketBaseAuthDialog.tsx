import { useState } from 'react';
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
import { isPocketBaseConfigured, POCKETBASE_URL } from '@/lib/pocketbase';
import { defineModal, getErrorMessage, type NoProps } from '@/lib/modals';

type Mode = 'signIn' | 'signUp';

const PocketBaseAuthDialogImpl = NiceModal.create<NoProps>(() => {
  const modal = useModal();
  const { signIn, signUp } = usePocketBaseAuth();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    modal.resolve(false);
    modal.hide();
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signIn') await signIn(email.trim(), password);
      else await signUp(email.trim(), password, name.trim() || undefined);
      modal.resolve(true);
      modal.hide();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={modal.visible} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === 'signIn' ? 'Sign in to Chats' : 'Create a chat account'}
          </DialogTitle>
          <DialogDescription>
            Optional PocketBase login. Projects and tasks work without it; Chats
            needs an account.
          </DialogDescription>
        </DialogHeader>

        {!isPocketBaseConfigured() ? (
          <Alert>
            <AlertDescription>
              Set <code>VITE_POCKETBASE_URL</code> to your PocketBase Fly app
              (see <code>deploy/pocketbase/README.md</code>).
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3">
            {mode === 'signUp' && (
              <div className="space-y-1.5">
                <Label htmlFor="pb-name">Name</Label>
                <Input
                  id="pb-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="pb-email">Email</Label>
              <Input
                id="pb-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pb-password">Password</Label>
              <Input
                id="pb-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={
                  mode === 'signIn' ? 'current-password' : 'new-password'
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Server: {POCKETBASE_URL}
            </p>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {isPocketBaseConfigured() && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                setMode((m) => (m === 'signIn' ? 'signUp' : 'signIn'))
              }
            >
              {mode === 'signIn' ? 'Create account' : 'Have an account? Sign in'}
            </Button>
          )}
          <Button variant="outline" onClick={close} disabled={busy}>
            Cancel
          </Button>
          {isPocketBaseConfigured() && (
            <Button onClick={() => void submit()} disabled={busy || !email}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'signIn' ? 'Sign in' : 'Sign up'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export const PocketBaseAuthDialog = defineModal<void, boolean>(
  PocketBaseAuthDialogImpl
);
