/** Test-Helfer: rendert die App mit Fakes in einem MemoryRouter. */
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../src/App';
import { createFakes, type Fakes } from './fakes';

/**
 * @param path        Start-URL
 * @param sessionUid  bereits angemeldeter Demo-User (optional)
 * @param customize   optional: Fakes vor dem Rendern anpassen (z. B. Fehler simulieren)
 * @param demoMode    lokale Demo-Funktionen (/demo-Links, Ansichts-Umschalter) einschalten
 */
export function renderApp(path: string, sessionUid?: string, customize?: (fakes: Fakes) => void, demoMode = false) {
  const fakes = createFakes(sessionUid);
  customize?.(fakes);
  const utils = render(
    <MemoryRouter initialEntries={[path]}>
      <App services={{ auth: fakes.auth, data: fakes.data, demoMode }} />
    </MemoryRouter>,
  );
  return { ...utils, fakes };
}
