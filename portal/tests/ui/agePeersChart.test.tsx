import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mapAgeOverview, mapAgeWaves } from '../../src/domain/age';
import { AgePeersChart } from '../../src/ui/school/demographics/AgePeersChart';
import { rawSchoolS001, rawWavesLateJoiner } from '../fixtures/age';

const overview = mapAgeOverview(rawSchoolS001);
const waves = mapAgeWaves(rawWavesLateJoiner);
const setup = (w = waves) => render(<AgePeersChart overview={overview} waves={w} />);
const slider = () => screen.getByRole('slider', { name: 'Wave (year)' });

afterEach(() => vi.useRealTimers());

describe('AgePeersChart', () => {
  it('zeigt Badge bei simulierter Historie, aber nicht sonst', () => {
    const { unmount } = setup();
    expect(screen.getByText('Simulated history (mock-up)')).toBeInTheDocument();
    unmount();
    setup({ ...waves, simulated: false });
    expect(screen.queryByText('Simulated history (mock-up)')).not.toBeInTheDocument();
  });

  it('Zeilen = Peers + 1, eigene Zeile beschriftet, Tooltip nur Werte', () => {
    setup();
    const rows = screen.getAllByTestId('age-row');
    expect(rows).toHaveLength(4); // 3 Peers (Benchmark "all", 2026) + eigene
    expect(screen.getByText('Your school')).toBeInTheDocument();
    expect(rows.filter((r) => r.getAttribute('data-own'))).toHaveLength(1);
    expect(within(rows[0]).getByText(/Median \d+\.\d yrs · middle 50 %/)).toBeInTheDocument();
  });

  it('enthält keine Peer-Namen im DOM', () => {
    const { container } = setup();
    expect(container.innerHTML).not.toMatch(/LEAK|Alpha|S001|S010/);
  });

  it('Regler auf 2022: Hochschule noch nicht in der Studie, Peers bleiben', () => {
    setup();
    fireEvent.change(slider(), { target: { value: '0' } });
    expect(screen.getByText('Not yet in the study (joined 2024)')).toBeInTheDocument();
    expect(screen.getByTestId('age-year')).toHaveTextContent('2022');
    expect(screen.getAllByTestId('age-row')).toHaveLength(2);
  });

  it('Benchmark-Umschalter wechselt Linie und KPI', () => {
    setup();
    expect(screen.getByText('34.0')).toBeInTheDocument(); // Benchmark-Median "all"
    fireEvent.click(screen.getByRole('button', { name: 'Region Europe' }));
    expect(screen.getByText('34.0')).toBeInTheDocument(); // Region hat ebenfalls 34
    expect(screen.getAllByTestId('age-row')).toHaveLength(3); // 2 Peers + eigene
    // 2025 hat keinen Benchmark -> keine Linie
    fireEvent.change(slider(), { target: { value: '3' } });
    expect(screen.queryByTestId('benchmark-line')).not.toBeInTheDocument();
  });

  it('Play rückt Jahr vor und stoppt am Ende', () => {
    vi.useFakeTimers();
    setup();
    fireEvent.change(slider(), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Play waves' }));
    expect(screen.getByRole('button', { name: 'Pause playback' })).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1100); });
    expect(screen.getByTestId('age-year')).toHaveTextContent('2023');
    // je Welle ein eigener Schritt: der nächste Timer entsteht erst nach dem Re-Render
    for (let i = 0; i < 3; i++) act(() => { vi.advanceTimersByTime(1100); });
    expect(screen.getByTestId('age-year')).toHaveTextContent('2026');
    expect(screen.getByRole('button', { name: 'Play waves' })).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByTestId('age-year')).toHaveTextContent('2026');
  });

  it('Trajectory-Checkbox blendet Verlaufspunkte ein/aus', () => {
    setup();
    expect(screen.getAllByTestId('trajectory-dot')).toHaveLength(2); // 2024, 2025
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show trajectory' }));
    expect(screen.queryAllByTestId('trajectory-dot')).toHaveLength(0);
  });

  it('KPI-Karten der Welle 2026', () => {
    setup();
    expect(screen.getByText('50th')).toBeInTheDocument();
    expect(screen.getByText('percentile of 4 schools')).toBeInTheDocument();
    expect(screen.getByText('n = 21')).toBeInTheDocument();
    expect(screen.getByText('+1.5 yrs vs previous wave')).toBeInTheDocument();
  });
});
