import { describe, expect, it } from 'vitest';
import { getQuickLinks } from '$lib/server/dashboard/quick-links';

describe('dashboard quick links', () => {
  it('uses explicit web destinations and safe provider defaults', () => {
    expect(
      getQuickLinks({
        CANVAS_BASE_URL: 'https://canvas.example.edu/api/v1',
        CANVAS_WEB_URL: 'https://canvas.example.edu/',
        STUDENTVUE_BASE_URL: 'https://studentvue.example.edu',
        BELLLOGIC_REQUEST_ORIGIN: 'https://bell-logic.us'
      })
    ).toEqual([
      { label: 'Canvas', href: 'https://canvas.example.edu/' },
      { label: 'StudentVUE', href: 'https://studentvue.example.edu/' },
      { label: 'Bell-Logic', href: 'https://bell-logic.us/' }
    ]);
  });

  it('omits blank and unsafe destinations', () => {
    expect(
      getQuickLinks({
        CANVAS_WEB_URL: 'javascript:alert(1)',
        STUDENTVUE_BASE_URL: '',
        BELLLOGIC_WEB_URL: 'not a url'
      })
    ).toEqual([]);
  });
});
