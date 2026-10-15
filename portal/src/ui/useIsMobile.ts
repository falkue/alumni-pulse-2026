/**
 * Gemeinsamer Hook für Diagramme: true auf schmalen Bildschirmen (<= 760 px).
 * In jsdom (Tests) fehlt matchMedia -> defensiv false.
 */
import { useEffect, useState } from 'react';

const MOBILE_QUERY = '(max-width: 760px)';

/** Hook: true auf schmalen Bildschirmen. In jsdom fehlt matchMedia -> defensiv false. */
export function useIsMobile(): boolean {
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const [mobile, setMobile] = useState(() => (supported ? window.matchMedia(MOBILE_QUERY).matches : false));
  useEffect(() => {
    if (!supported) return;
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setMobile(mql.matches);
    onChange();
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, [supported]);
  return mobile;
}
