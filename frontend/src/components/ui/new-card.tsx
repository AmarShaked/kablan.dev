import * as React from 'react';

import { cn } from '@/lib/utils';

const NewCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex flex-col', className)} {...props} />
));
NewCard.displayName = 'NewCard';

interface NewCardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  actions?: React.ReactNode;
}

const NewCardHeader = React.forwardRef<HTMLDivElement, NewCardHeaderProps>(
  ({ className, actions, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        // One plain rule underneath. It used to be dashed, with a solid line drawn on top of
        // the next header by a pseudo-element, so wherever a header sat inside a bordered
        // container two lines stacked a pixel apart and read as a rendering fault.
        //
        // The floor of 48px is the same one the task column's header uses: these two sit side by
        // side, and a three-pixel difference puts a visible step in the rule that runs across
        // the top of the page.
        'relative min-h-12 bg-background text-foreground text-base flex items-center gap-2 px-3 border-b',
        actions && 'justify-between',
        className
      )}
      {...props}
    >
      {actions ? (
        <>
          <div className="min-w-0 flex-1 py-3">{children}</div>
          <div className="flex items-center gap-4">{actions}</div>
        </>
      ) : (
        children
      )}
    </div>
  )
);
NewCardHeader.displayName = 'NewCardHeader';

const NewCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex-1 bg-muted text-foreground gap-2', className)}
    {...props}
  />
));
NewCardContent.displayName = 'CardContent';

export { NewCard, NewCardHeader, NewCardContent };
export type { NewCardHeaderProps };
