import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from './renderApp';

describe('Admin-Liste', () => {
  it('zeigt alle Schulen und Kennzahlen', async () => {
    renderApp('/admin', 'admin-demo');
    expect(await screen.findByText('Alpha Business School')).toBeInTheDocument();
    for (const n of ['Beta Institute of Management', 'Gamma University', 'Delta Graduate School']) {
      expect(screen.getByText(n)).toBeInTheDocument();
    }
    expect(screen.getByTestId('result-count')).toHaveTextContent('4 of 4');
    // Summe n = 100+200+300+400
    expect(screen.getByText(/^1,000$/)).toBeInTheDocument();
  });

  it('filtert per Suche', async () => {
    renderApp('/admin', 'admin-demo');
    await screen.findByText('Alpha Business School');
    await userEvent.type(screen.getByLabelText('Search'), 'tokyo');
    expect(screen.getByText('Beta Institute of Management')).toBeInTheDocument();
    expect(screen.queryByText('Alpha Business School')).not.toBeInTheDocument();
    expect(screen.getByTestId('result-count')).toHaveTextContent('1 of 4');
  });

  it('filtert per Region', async () => {
    renderApp('/admin', 'admin-demo');
    await screen.findByText('Alpha Business School');
    await userEvent.selectOptions(screen.getByLabelText('Region'), 'Europe');
    expect(screen.getByTestId('result-count')).toHaveTextContent('2 of 4');
    expect(screen.queryByText('Gamma University')).not.toBeInTheDocument();
  });

  it('filtert per Zugangsstatus', async () => {
    renderApp('/admin', 'admin-demo');
    await screen.findByText('Alpha Business School');
    await userEvent.selectOptions(screen.getByLabelText('Access status'), 'none');
    // Kein aktiver Account -> "Kein Zugang": S002 (nur deaktiviert),
    // S003 (nur eingeladen), S004 (gar kein Account). S001 ist aktiv.
    expect(screen.getByText('Delta Graduate School')).toBeInTheDocument();
    expect(screen.getByText('Gamma University')).toBeInTheDocument();
    expect(screen.queryByText('Alpha Business School')).not.toBeInTheDocument();
    expect(screen.getByTestId('result-count')).toHaveTextContent('3 of 4');
  });
});

describe('Admin-Detail', () => {
  it('Freischalten ruft setAccountStatus und zeigt den neuen Status', async () => {
    const { fakes } = renderApp('/admin/schools/S002', 'admin-demo');
    expect(await screen.findByRole('heading', { level: 1, name: 'Beta Institute of Management' })).toBeInTheDocument();
    const row = screen.getByRole('row', { name: /Bob Beta/ });
    expect(within(row).getByText('Disabled')).toBeInTheDocument();
    await userEvent.click(within(row).getByRole('button', { name: 'Activate' }));
    const updated = await screen.findByRole('row', { name: /Bob Beta.*Active/ });
    expect(within(updated).getByRole('button', { name: 'Deactivate' })).toBeInTheDocument();
    expect(updated).toHaveTextContent('by admin-demo');
    expect(fakes.statusCalls).toEqual([{ uid: 'u-S002', status: 'active' }]);
  });

  it('Einladen legt einen Account mit Status "Invited" an', async () => {
    renderApp('/admin/schools/S004', 'admin-demo');
    await screen.findByRole('heading', { level: 1, name: 'Delta Graduate School' });
    await userEvent.type(screen.getByLabelText('Email'), 'dora@delta.example');
    await userEvent.type(screen.getByLabelText('Name'), 'Dora Delta');
    await userEvent.click(screen.getByRole('button', { name: 'Invite' }));
    expect(await screen.findByRole('row', { name: /Dora Delta.*Invited/ })).toBeInTheDocument();
    expect(screen.getByText('No email will be sent.')).toBeInTheDocument();
  });
});
