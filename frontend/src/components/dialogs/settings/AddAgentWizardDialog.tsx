import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { defineModal } from '@/lib/modals';
import { AgentIcon } from '@/components/agents/AgentIcon';
import { agentLabel } from '@/utils/agentLabels';
import { isAgentConnected } from '@/utils/configuredAgents';
import { cn } from '@/lib/utils';
import type { AvailabilityInfo, BaseCodingAgent } from 'shared/types';

export interface AddAgentWizardDialogProps {
  candidates: BaseCodingAgent[];
  availability: Partial<Record<BaseCodingAgent, AvailabilityInfo>>;
}

export type AddAgentWizardResult = {
  action: 'added' | 'canceled';
  agent?: BaseCodingAgent;
};

const AddAgentWizardDialogImpl = NiceModal.create<AddAgentWizardDialogProps>(
  ({ candidates, availability }) => {
    const { t } = useTranslation(['settings', 'common']);
    const modal = useModal();
    const [selected, setSelected] = useState<BaseCodingAgent | null>(
      candidates[0] ?? null
    );
    const [step, setStep] = useState<'choose' | 'connect'>('choose');

    const settled = useRef(false);

    useEffect(() => {
      if (modal.visible) {
        settled.current = false;
        setSelected(candidates[0] ?? null);
        setStep('choose');
      }
    }, [modal.visible, candidates]);

    const connected = isAgentConnected(
      selected ? availability[selected] : undefined
    );

    const settle = (result: AddAgentWizardResult) => {
      if (settled.current) return;
      settled.current = true;
      modal.resolve(result);
      modal.hide();
    };

    const handleCancel = () => {
      settle({ action: 'canceled' });
    };

    const handleAdd = () => {
      if (!selected) return;
      settle({ action: 'added', agent: selected });
    };

    return (
      <Dialog
        open={modal.visible}
        onOpenChange={(open) => {
          if (!open) handleCancel();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('settings.agents.wizard.title')}</DialogTitle>
            <DialogDescription>
              {step === 'choose'
                ? t('settings.agents.wizard.chooseHint')
                : t('settings.agents.wizard.connectHint')}
            </DialogDescription>
          </DialogHeader>

          {step === 'choose' &&
            (candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                {t('settings.agents.wizard.allConfigured')}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {candidates.map((agent) => (
                  <button
                    key={agent}
                    type="button"
                    onClick={() => setSelected(agent)}
                    className={cn(
                      'flex items-center gap-2 rounded-md border px-3 py-3 text-left text-sm',
                      selected === agent
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                    )}
                  >
                    <AgentIcon agent={agent} className="h-4 w-4" />
                    {agentLabel(agent)}
                  </button>
                ))}
              </div>
            ))}

          {step === 'connect' && selected && (
            <div className="rounded-md border p-4 space-y-2">
              <div className="flex items-center gap-2">
                <AgentIcon agent={selected} className="h-6 w-6" />
                <div>
                  <div className="font-medium">{agentLabel(selected)}</div>
                  <div className="text-xs text-muted-foreground">
                    {connected
                      ? t('settings.agents.connected')
                      : t('settings.agents.notConnected')}
                  </div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground flex items-start gap-2">
                {connected && (
                  <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                )}
                {connected
                  ? t('settings.agents.wizard.ready')
                  : t('settings.agents.wizard.notFound')}
              </p>
            </div>
          )}

          <DialogFooter>
            {step === 'choose' ? (
              <>
                <Button variant="outline" onClick={handleCancel}>
                  {t('common:buttons.cancel')}
                </Button>
                <Button disabled={!selected} onClick={() => setStep('connect')}>
                  {t('common:buttons.continue')}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setStep('choose')}>
                  {t('common:buttons.back')}
                </Button>
                <Button disabled={!selected} onClick={handleAdd}>
                  {t('settings.agents.addAgent')}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export const AddAgentWizardDialog = defineModal<
  AddAgentWizardDialogProps,
  AddAgentWizardResult
>(AddAgentWizardDialogImpl);
