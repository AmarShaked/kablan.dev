import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SilenceButton } from './SilenceButton';

const updateAndSaveConfig = vi.fn().mockResolvedValue(true);
let soundEnabled = true;

vi.mock('@/contexts/UserSystemContext', () => ({
  useUserSystem: () => ({
    config: {
      notifications: {
        sound_enabled: soundEnabled,
        push_enabled: true,
        sound_file: 'ABSTRACT_SOUND1',
      },
    },
    updateAndSaveConfig,
  }),
}));

describe('SilenceButton', () => {
  it('silences notification sound', () => {
    soundEnabled = true;
    render(<SilenceButton />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Silence notifications' })
    );

    expect(updateAndSaveConfig).toHaveBeenCalledWith({
      notifications: {
        sound_enabled: false,
        push_enabled: true,
        sound_file: 'ABSTRACT_SOUND1',
      },
    });
  });

  it('turns the sound back on', () => {
    soundEnabled = false;
    render(<SilenceButton />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Unmute notifications' })
    );

    expect(updateAndSaveConfig).toHaveBeenCalledWith({
      notifications: {
        sound_enabled: true,
        push_enabled: true,
        sound_file: 'ABSTRACT_SOUND1',
      },
    });
  });
});
