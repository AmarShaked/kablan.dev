import { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink, Sparkles } from 'lucide-react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useUserSystem } from '@/contexts/UserSystemContext';
import { defineModal, type NoProps } from '@/lib/modals';

// Kablan fork: upstream embedded their own release-notes site in an iframe here. Pointed at
// Kablan's releases instead, so the app never loads content from the original owner.
//
// The notes are not embedded: github.com serves `x-frame-options: deny`, so an iframe of a
// releases page is blocked by the browser every time, and a blocked frame fires `load` rather
// than `error` — the old code sat on a blank pane for five seconds before admitting it. The
// release notes open in the user's browser instead, and only when they ask for them. Nothing
// here makes a network request.
const RELEASES_URL = 'https://github.com/AmarShaked/kablan.dev/releases';

const ReleaseNotesDialogImpl = NiceModal.create<NoProps>(() => {
  const modal = useModal();
  const { config } = useUserSystem();

  // The server writes the running APP_VERSION into `last_app_version` during start-up, before it
  // serves any config, so this is the version the user is on now — not the one they came from.
  const version = config?.last_app_version ?? null;

  const releaseNotesUrl = useMemo(
    () => (version ? `${RELEASES_URL}/tag/v${version}` : RELEASES_URL),
    [version]
  );

  const handleOpenInBrowser = () => {
    window.open(releaseNotesUrl, '_blank', 'noopener,noreferrer');
    modal.resolve();
  };

  return (
    <Dialog
      open={modal.visible}
      onOpenChange={(open) => !open && modal.resolve()}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-primary" />
            <DialogTitle>
              {version
                ? `Kablan is now on ${version}`
                : 'Kablan has been updated'}
            </DialogTitle>
          </div>
          <DialogDescription className="text-left pt-2">
            The release notes for this version live on GitHub. They open in your
            browser — Kablan does not load them in the app.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => modal.resolve()}>
            Not now
          </Button>
          <Button onClick={handleOpenInBrowser}>
            <ExternalLink className="h-4 w-4 mr-2" />
            See what's new
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export const ReleaseNotesDialog = defineModal<void, void>(
  ReleaseNotesDialogImpl
);
