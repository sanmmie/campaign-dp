import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';

import type { CampaignPack, TemplateVersion } from '@deltadp/shared';

/**
 * The templates page resolves the campaign pack that owns a template before it
 * creates a project. The backend needs that pack id to render the template, so
 * a wrong (or missing) pack id produces a broken editor.
 */

const mockRequest = vi.fn();
const mockAddToast = vi.fn();
const mockNavigate = vi.fn();

vi.mock('../hooks/useApi', () => ({
  useApi: () => ({ request: mockRequest, loading: false }),
}));

vi.mock('../hooks/useToast', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

vi.mock('../components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    locale: 'en',
    setLocale: () => {},
  }),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

import { Templates } from './Templates';
import { useAuthStore, useProjectStore, useTemplateStore } from '../store';

function makeVersion(
  id: string,
  templateId: string,
  version: number,
  name: string
): TemplateVersion {
  return {
    id,
    templateId,
    version,
    name,
    category: 'political',
    canvas: { width: 1080, height: 1080 },
    photoZone: { x: 0, y: 0, width: 1080, height: 1080, shape: 'square', locked: false },
    layers: [],
    isPublished: true,
    createdBy: 'user-1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

const VERSION_A = makeVersion('ver-a-1', 'tpl-a', 1, 'Alpha template');
const VERSION_B = makeVersion('ver-b-2', 'tpl-b', 2, 'Beta template');

const PACK: CampaignPack = {
  id: 'pack-1',
  name: 'Renewed Hope',
  authorizedBy: 'Candidate',
  authorizationRef: 'REF-1',
  disclaimer: 'Paid for by Candidate',
  brand: { primary: '#123456', secondary: '#654321', accent: '#abcdef' },
  assets: { candidatePortrait: [], backgroundTextures: [] },
  templates: [
    {
      id: 'tpl-a',
      name: 'Alpha template',
      category: 'political',
      latestVersion: 1,
      versions: [VERSION_A],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'tpl-b',
      name: 'Beta template',
      category: 'political',
      latestVersion: 2,
      versions: [VERSION_B],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ],
  defaultCopy: { headline: 'Headline', subhead: 'Subhead' },
  shareTargets: ['whatsapp'],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

async function renderTemplates() {
  const result = render(<Templates />);
  await waitFor(() => expect(mockRequest).toHaveBeenCalled());
  return result;
}

beforeEach(() => {
  mockRequest.mockReset();
  mockAddToast.mockReset();
  mockNavigate.mockReset();

  mockRequest.mockImplementation(async (method: string, endpoint: string, body?: unknown) => {
    if (method === 'GET' && endpoint === '/packs') {
      return PACK;
    }
    if (method === 'POST' && endpoint === '/projects') {
      return { id: 'project-1', ...(body as object) };
    }
    return null;
  });

  useTemplateStore.setState({ templates: [], packs: [] });
  useProjectStore.setState({ projects: [], currentProject: null });
  useAuthStore.setState({
    user: {
      id: 'user-1',
      email: 'user@example.com',
      memberships: [],
      isPlatformAdmin: false,
    },
    isAdmin: false,
    isGuest: false,
    guestProject: null,
    authReady: true,
  });
  localStorage.removeItem('guest-projects');
});

describe('Phase 9 — template pack resolution', () => {
  it('tags every loaded template version with the owning pack id', async () => {
    await renderTemplates();

    await waitFor(() => {
      expect(useTemplateStore.getState().templates).toHaveLength(2);
    });

    const templates = useTemplateStore.getState().templates;
    expect(templates.every((t) => t.packId === 'pack-1')).toBe(true);
    expect(templates.map((t) => t.templateId)).toEqual(['tpl-a', 'tpl-b']);
  });

  it('exposes the loaded templates through getTemplatesByPack', async () => {
    await renderTemplates();

    await waitFor(() => {
      expect(useTemplateStore.getState().templates).toHaveLength(2);
    });

    expect(useTemplateStore.getState().getTemplatesByPack('pack-1')).toHaveLength(2);
    expect(useTemplateStore.getState().getTemplatesByPack('pack-other')).toHaveLength(0);
  });

  it('creates a project with the pack id resolved from the template', async () => {
    await renderTemplates();

    const buttons = await screen.findAllByRole('button', { name: 'templates.useTemplate' });
    fireEvent.click(buttons[1]);

    await waitFor(() => {
      const call = mockRequest.mock.calls.find(
        ([method, endpoint]) => method === 'POST' && endpoint === '/projects'
      );
      expect(call).toBeDefined();
    });

    const call = mockRequest.mock.calls.find(
      ([method, endpoint]) => method === 'POST' && endpoint === '/projects'
    )!;
    const payload = call[2] as any;

    expect(payload.packId).toBe('pack-1');
    expect(payload.templateId).toBe('tpl-b');
    expect(payload.templateVersion).toBe(2);
    expect(mockNavigate).toHaveBeenCalledWith('/editor/project-1');
  });

  it('falls back to the owning pack when a template carries no pack id', async () => {
    await renderTemplates();

    await waitFor(() => {
      expect(useTemplateStore.getState().templates).toHaveLength(2);
    });

    // Simulate a template that lost its pack tag (e.g. restored from an
    // older snapshot) while the owning pack is still known.
    const templates = useTemplateStore.getState().templates.map((t) => ({
      ...t,
      packId: undefined,
    }));
    act(() => {
      useTemplateStore.setState({ templates });
    });

    const buttons = screen.getAllByRole('button', { name: 'templates.useTemplate' });
    fireEvent.click(buttons[0]);
    await waitFor(() => {
      const call = mockRequest.mock.calls.find(
        ([method, endpoint]) => method === 'POST' && endpoint === '/projects'
      );
      expect(call).toBeDefined();
    });

    const call = mockRequest.mock.calls.find(
      ([method, endpoint]) => method === 'POST' && endpoint === '/projects'
    )!;
    expect((call[2] as any).packId).toBe('pack-1');
  });

  it('does not create a project when the pack id cannot be resolved', async () => {
    await renderTemplates();

    await waitFor(() => {
      expect(useTemplateStore.getState().templates).toHaveLength(2);
    });

    // Neither the template nor the known packs carry an owner: the backend
    // could not render the template, so no project may be created.
    act(() => {
      useTemplateStore.setState({
        templates: [{ ...VERSION_A, packId: undefined }],
        packs: [],
      });
    });
    useAuthStore.setState({ user: null, isGuest: false, authReady: true });

    const buttons = await screen.findAllByRole('button', {
      name: 'templates.useTemplate',
    });
    fireEvent.click(buttons[0]);

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' })
      );
    });

    const postCall = mockRequest.mock.calls.find(
      ([method, endpoint]) => method === 'POST' && endpoint === '/projects'
    );
    expect(postCall).toBeUndefined();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('keeps guest sessions on the local project path', async () => {
    useAuthStore.setState({ user: null, isGuest: false, authReady: true });

    await renderTemplates();

    const buttons = await screen.findAllByRole('button', { name: 'templates.useTemplate' });
    fireEvent.click(buttons[0]);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalled();
    });

    const postCall = mockRequest.mock.calls.find(
      ([method, endpoint]) => method === 'POST' && endpoint === '/projects'
    );
    expect(postCall).toBeUndefined();
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringMatching(/^\/editor\/guest-/)
    );
    expect(useAuthStore.getState().isGuest).toBe(true);
  });
});
