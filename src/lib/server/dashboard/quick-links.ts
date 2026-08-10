export interface QuickLink {
  label: string;
  href: string;
}

interface QuickLinkEnvironment {
  CANVAS_BASE_URL?: string;
  CANVAS_WEB_URL?: string;
  STUDENTVUE_BASE_URL?: string;
  STUDENTVUE_WEB_URL?: string;
  BELLLOGIC_REQUEST_ORIGIN?: string;
  BELLLOGIC_WEB_URL?: string;
}

function safeWebUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null;

  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function getQuickLinks(environment: QuickLinkEnvironment): QuickLink[] {
  const candidates = [
    ['Canvas', environment.CANVAS_WEB_URL ?? environment.CANVAS_BASE_URL],
    ['StudentVUE', environment.STUDENTVUE_WEB_URL ?? environment.STUDENTVUE_BASE_URL],
    ['Bell-Logic', environment.BELLLOGIC_WEB_URL ?? environment.BELLLOGIC_REQUEST_ORIGIN]
  ] as const;

  return candidates.flatMap(([label, value]) => {
    const href = safeWebUrl(value);
    return href ? [{ label, href }] : [];
  });
}
