import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { Check, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
import { claudeAuthApi, type ClaudeAuthLoginResponse } from '@/lib/api';
import { usageKeys } from '@/lib/queryKeys';
import { defineModal, getErrorMessage, type NoProps } from '@/lib/modals';

type Phase =
  | { type: 'starting' }
  | { type: 'waiting'; url: string | null }
  | { type: 'success'; email: string | null }
  | { type: 'error'; message: string };

const ClaudeAuthDialogImpl = NiceModal.create<NoProps>(() => {
  const modal = useModal();
  const { t } = useTranslation('tasks');
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>({ type: 'starting' });

  const applyLoginState = useCallback(
    async (state: ClaudeAuthLoginResponse) => {
      if (state.error) {
        setPhase({ type: 'error', message: state.error });
        return;
      }
      if (state.running) {
        setPhase({ type: 'waiting', url: state.url });
        return;
      }
      let email: string | null = null;
      try {
        email = (await claudeAuthApi.status()).email;
      } catch {
        email = null;
      }
      await queryClient.invalidateQueries({ queryKey: usageKeys.all });
      setPhase({ type: 'success', email });
    },
    [queryClient]
  );

  useEffect(() => {
    if (!modal.visible) return;
    let cancelled = false;

    const begin = async () => {
      setPhase({ type: 'starting' });
      try {
        const started = await claudeAuthApi.login();
        if (cancelled) return;
        await applyLoginState(started);
      } catch (err) {
        if (!cancelled) {
          setPhase({ type: 'error', message: getErrorMessage(err) });
        }
      }
    };

    void begin();
    return () => {
      cancelled = true;
    };
  }, [modal.visible, applyLoginState]);

  useEffect(() => {
    if (phase.type !== 'waiting') return;
    let cancelled = false;

    const poll = async () => {
      try {
        const state = await claudeAuthApi.loginState();
        if (cancelled || state.running) return;
        await applyLoginState(state);
      } catch (err) {
        if (!cancelled) {
          setPhase({ type: 'error', message: getErrorMessage(err) });
        }
      }
    };

    const id = window.setInterval(() => void poll(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [phase.type, applyLoginState]);

  const handleClose = () => {
    modal.resolve(phase.type === 'success');
    modal.hide();
  };

  const handleRetry = () => {
    setPhase({ type: 'starting' });
    void (async () => {
      try {
        await applyLoginState(await claudeAuthApi.login());
      } catch (err) {
        setPhase({ type: 'error', message: getErrorMessage(err) });
      }
    })();
  };

  return (
    <Dialog
      open={modal.visible}
      onOpenChange={(open) => !open && handleClose()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('attempt.claudeAuth.title')}</DialogTitle>
          <DialogDescription>
            {t('attempt.claudeAuth.description')}
          </DialogDescription>
        </DialogHeader>

        {phase.type === 'starting' && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('attempt.claudeAuth.opening')}
          </p>
        )}

        {phase.type === 'waiting' && (
          <div className="space-y-3 text-sm">
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('attempt.claudeAuth.waiting')}
            </p>
            {phase.url && (
              <p>
                {t('attempt.claudeAuth.visit')}{' '}
                <a
                  href={phase.url}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all underline"
                >
                  {phase.url}
                </a>
              </p>
            )}
          </div>
        )}

        {phase.type === 'success' && (
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2">
              <Check className="h-4 w-4 text-success" />
              {phase.email
                ? t('attempt.claudeAuth.signedIn', { email: phase.email })
                : t('attempt.claudeAuth.signedInNoEmail')}
            </p>
            <p className="text-muted-foreground">
              {t('attempt.claudeAuth.signedInHint')}
            </p>
          </div>
        )}

        {phase.type === 'error' && (
          <Alert variant="destructive">
            <AlertDescription>{phase.message}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          {phase.type === 'error' && (
            <Button onClick={handleRetry}>
              {t('attempt.claudeAuth.retry')}
            </Button>
          )}
          <Button
            variant={phase.type === 'success' ? 'default' : 'outline'}
            onClick={handleClose}
          >
            {t('attempt.claudeAuth.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export const ClaudeAuthDialog = defineModal<void, boolean>(
  ClaudeAuthDialogImpl
);

export function ClaudeLoginButton({ className }: { className?: string }) {
  const { t } = useTranslation('tasks');

  return (
    <Button
      variant="default"
      size="sm"
      className={className}
      onClick={() => void ClaudeAuthDialog.show()}
    >
      {t('attempt.claudeAuth.signIn')}
    </Button>
  );
}
