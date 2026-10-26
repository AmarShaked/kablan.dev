import type { SettingsSectionType } from './SettingsSection';

const ALL_SECTIONS: SettingsSectionType[] = [
  'general',
  'repos',
  'organizations',
  'remote-projects',
  'agents',
  'mcp',
];

// Both of these talk to the shared API. Without VITE_VK_SHARED_API_BASE the
// backend answers 400 "Remote client not configured", so they are hidden
// rather than shipped as tabs that error when clicked.
const REMOTE_SECTIONS: SettingsSectionType[] = [
  'organizations',
  'remote-projects',
];

export function visibleSettingsSections(
  remoteConfigured: boolean
): SettingsSectionType[] {
  if (remoteConfigured) return ALL_SECTIONS;
  return ALL_SECTIONS.filter((id) => !REMOTE_SECTIONS.includes(id));
}

/**
 * Callers can deep-link into a section that this build does not expose.
 * Fall back to general rather than rendering a section the user cannot see
 * in the nav.
 */
export function resolveInitialSection(
  requested: SettingsSectionType | undefined,
  available: readonly SettingsSectionType[]
): SettingsSectionType {
  return requested && available.includes(requested) ? requested : 'general';
}
