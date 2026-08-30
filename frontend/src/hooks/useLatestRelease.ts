import { useQuery } from '@tanstack/react-query';

/**
 * Whether a newer Kablan has been released than the one running.
 *
 * Kablan runs from a binary the npm wrapper downloaded, so it cannot update itself in place —
 * the most it can do is notice and say so. The check is a single unauthenticated read of the
 * repository's latest release: no data about this machine leaves it, and a failure is silent,
 * because "we could not reach GitHub" is not something to interrupt anyone with.
 */

const REPO = 'AmarShaked/kablan.dev';

/** The version this build was cut as, baked in by Vite from the wrapper's package.json. */
export const CURRENT_VERSION = __APP_VERSION__;

/** Compare two dotted versions. Anything unparseable sorts as 0, so noise cannot fake an update. */
function isNewer(candidate: string, current: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^v/, '')
      .split('-')[0]
      .split('.')
      .map((n) => parseInt(n, 10) || 0);

  const a = parse(candidate);
  const b = parse(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

export function useLatestRelease() {
  const { data } = useQuery({
    queryKey: ['latest-release'],
    queryFn: async (): Promise<string | null> => {
      const res = await fetch(
        `https://api.github.com/repos/${REPO}/releases/latest`,
        { headers: { Accept: 'application/vnd.github+json' } }
      );
      if (!res.ok) return null;
      const release = await res.json();
      return typeof release?.tag_name === 'string'
        ? release.tag_name.replace(/^v/, '')
        : null;
    },
    // Releases are not frequent and the answer is not urgent; checking once an hour is plenty,
    // and retrying a failed check would only multiply requests from a machine that is offline.
    staleTime: 60 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const latest = data ?? null;
  return {
    latest,
    current: CURRENT_VERSION,
    updateAvailable: latest !== null && isNewer(latest, CURRENT_VERSION),
  };
}
