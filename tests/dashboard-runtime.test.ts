import { afterEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE_NOW, getConfiguredDashboard } from '$lib/server/dashboard/dashboard-service';

describe('dashboard runtime composition', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the zero-configuration preview deterministic and fixture-only', async () => {
    const dashboard = await getConfiguredDashboard({});

    expect(dashboard.generatedAt).toBe(new Date(FIXTURE_NOW).toISOString());
    expect(dashboard.displayName).toBe('Student');
    expect(dashboard.syncStatus.map((status) => status.status)).toEqual([
      'fixture',
      'fixture',
      'fixture'
    ]);
    expect(dashboard.priorityAssignments.length).toBeGreaterThan(0);
    expect(dashboard.scheduleState.phase).toBe('in_period');
  });

  it('uses the configured display name', async () => {
    const dashboard = await getConfiguredDashboard({ SCHOOLDAY_DISPLAY_NAME: 'Alex' });

    expect(dashboard.displayName).toBe('Alex');
  });

  it('marks partial provider configuration as degraded without making a network request', async () => {
    const dashboard = await getConfiguredDashboard({
      CANVAS_BASE_URL: 'https://canvas.example.edu',
      BELLLOGIC_API_URL: 'https://api.bell-logic.us',
      STUDENTVUE_BASE_URL: 'https://studentvue.example.edu'
    });

    expect(dashboard.syncStatus.find((status) => status.provider === 'canvas')).toMatchObject({
      status: 'error',
      label: 'Canvas configuration incomplete; using fixtures'
    });
    expect(dashboard.syncStatus.find((status) => status.provider === 'bellLogic')).toMatchObject({
      status: 'error',
      label: 'Bell-Logic configuration incomplete; using fixtures'
    });
    expect(dashboard.syncStatus.find((status) => status.provider === 'studentVue')).toMatchObject({
      status: 'error',
      label: 'StudentVUE configuration incomplete; using fixtures'
    });
  });

  it('degrades only StudentVUE when its configured web portal is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));

    const dashboard = await getConfiguredDashboard({
      STUDENTVUE_BASE_URL: 'https://studentvue.example.edu',
      STUDENTVUE_USERNAME: 'student',
      STUDENTVUE_PASSWORD: 'password'
    });

    expect(dashboard.syncStatus).toEqual([
      expect.objectContaining({ provider: 'canvas', status: 'fixture' }),
      expect.objectContaining({
        provider: 'studentVue',
        status: 'error',
        label: 'StudentVUE unavailable; using fixtures'
      }),
      expect.objectContaining({ provider: 'bellLogic', status: 'fixture' })
    ]);
    expect(dashboard.grades.length).toBeGreaterThan(0);
  });
});
