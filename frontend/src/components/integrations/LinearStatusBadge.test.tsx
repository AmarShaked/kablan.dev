import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { LinearStatusBadge } from './LinearStatusBadge';
import type { LinearStatusType } from '@/lib/integrations/linear';

const TYPES: LinearStatusType[] = [
  'triage',
  'backlog',
  'unstarted',
  'started',
  'completed',
  'canceled',
];

describe('LinearStatusBadge', () => {
  it.each(TYPES)('renders label for type %s', (type) => {
    const { getByText } = render(
      <LinearStatusBadge name={`Status-${type}`} type={type} color="#f00" />
    );
    expect(getByText(`Status-${type}`)).toBeTruthy();
  });

  it('can hide the label', () => {
    const { queryByText } = render(
      <LinearStatusBadge
        name="Hidden"
        type="started"
        color="#0f0"
        showLabel={false}
      />
    );
    expect(queryByText('Hidden')).toBeNull();
  });

  it('renders Duplicate with a slash icon treatment', () => {
    const { container, getByText } = render(
      <LinearStatusBadge name="Duplicate" type="canceled" color="#95a2b3" />
    );
    expect(getByText('Duplicate')).toBeTruthy();
    expect(container.querySelector('svg path')).toBeTruthy();
  });
});
