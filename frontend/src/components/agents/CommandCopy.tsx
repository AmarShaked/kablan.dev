import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function CommandCopy({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be denied; the field is still selectable.
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Input
        readOnly
        value={command}
        className="font-mono text-xs"
        onFocus={(event) => event.currentTarget.select()}
        aria-label="Command"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0"
        onClick={() => void copy()}
        aria-label={copied ? 'Copied' : 'Copy command'}
      >
        {copied ? (
          <Check className={cn('h-3.5 w-3.5 text-success')} />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
}
