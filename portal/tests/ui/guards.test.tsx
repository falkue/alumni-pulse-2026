import { screen } from '@testing-library/react';
import { renderApp } from './renderApp';

describe('Route-Guards', () => {
  it('ohne Session landet man auf dem Login (inkl. Demo-Banner)', async () => {
    renderApp('/admin');
    expect(await screen.findByText(/Local demo – no real sign-in/)).toBeInTheDocument();
    // Demo-Accounts werden asynchron geladen -> findBy statt getBy
    expect(await screen.findByRole('button', { name: /Sign in as admin/ })).toBeInTheDocument();
  });

  it('school-User kann /admin nicht sehen und landet in /school', async () => {
    renderApp('/admin', 'u-S001');
    expect(await screen.findByRole('heading', { level: 1, name: 'Alpha Business School' })).toBeInTheDocument();
    expect(screen.queryByText('Beta Institute of Management')).not.toBeInTheDocument();
  });

  it('admin landet auf /admin', async () => {
    renderApp('/login', 'admin-demo');
    expect(await screen.findByRole('heading', { level: 1, name: 'Institutions' })).toBeInTheDocument();
  });

  it('admin kann /school nicht sehen', async () => {
    renderApp('/school/overview', 'admin-demo');
    expect(await screen.findByRole('heading', { level: 1, name: 'Institutions' })).toBeInTheDocument();
  });
});
