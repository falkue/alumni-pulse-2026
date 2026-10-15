import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from './renderApp';

describe('Login', () => {
  it('zeigt bei deaktiviertem Account eine verständliche Meldung', async () => {
    renderApp('/login');
    await userEvent.click(await screen.findByRole('button', { name: /Bob Beta/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This account is disabled');
  });

  it('zeigt bei eingeladenem Account "Noch nicht freigeschaltet"', async () => {
    renderApp('/login');
    await userEvent.click(await screen.findByRole('button', { name: /Carla Gamma/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Not yet activated');
  });

  it('Admin-Login führt nach /admin; Suche filtert die Accountliste', async () => {
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Search accounts'), 'alice');
    expect(screen.queryByRole('button', { name: /Bob Beta/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Alice Alpha/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Alice Alpha/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Alpha Business School' })).toBeInTheDocument();
  });
});
