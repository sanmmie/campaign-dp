import { PrismaClient } from '@prisma/client';

const TEMPLATE_ID = 'tmpl-apc-tinubu-premium';
const VERSION = 1;

function backgroundDataUri(): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#063b2a"/>
          <stop offset="0.55" stop-color="#008751"/>
          <stop offset="1" stop-color="#001f16"/>
        </linearGradient>
        <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#f6c343"/>
          <stop offset="1" stop-color="#fff1a6"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="1500" fill="url(#bg)"/>
      <circle cx="1040" cy="180" r="330" fill="#e31b23" opacity="0.9"/>
      <circle cx="1050" cy="200" r="240" fill="none" stroke="url(#gold)" stroke-width="16" opacity="0.8"/>
      <path d="M0 1190 C340 1040 640 1290 1200 1070 L1200 1500 L0 1500Z" fill="#001f16" opacity="0.78"/>
      <path d="M0 1130 C330 1010 640 1230 1200 1010" fill="none" stroke="url(#gold)" stroke-width="10" opacity="0.9"/>
    </svg>
  `;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function layersJson(): string {
  const bg = backgroundDataUri();
  return JSON.stringify([
    { id: 'bg', type: 'image', x: 0, y: 0, width: 1200, height: 1500, rotation: 0, opacity: 1, locked: true, visible: true, zIndex: 0, src: bg, fit: 'cover' },
    { id: 'portrait', type: 'photo', x: 90, y: 250, width: 520, height: 760, rotation: 0, opacity: 1, locked: true, visible: true, zIndex: 1, shape: 'rounded-rect', borderRadius: 36 },
    { id: 'party', type: 'text', x: 690, y: 230, width: 400, height: 70, rotation: 0, opacity: 1, locked: false, visible: true, zIndex: 2, text: 'APC  •  RENEWED HOPE', fontSize: 27, fontFamily: 'Montserrat', fontWeight: 700, color: '#fff1a6', alignment: 'left', lineHeight: 1.2, letterSpacing: 1.5, textTransform: 'uppercase' },
    { id: 'candidate', type: 'text', x: 690, y: 380, width: 420, height: 190, rotation: 0, opacity: 1, locked: false, visible: true, zIndex: 2, text: 'President\nBola Ahmed\nTinubu', fontSize: 54, fontFamily: 'Montserrat', fontWeight: 800, color: '#ffffff', alignment: 'left', lineHeight: 1.05, letterSpacing: -0.5, textTransform: 'none' },
    { id: 'message', type: 'text', x: 690, y: 660, width: 390, height: 120, rotation: 0, opacity: 1, locked: false, visible: true, zIndex: 2, text: 'Building a stronger, more prosperous Nigeria', fontSize: 29, fontFamily: 'Montserrat', fontWeight: 500, color: '#fff1a6', alignment: 'left', lineHeight: 1.25, letterSpacing: 0, textTransform: 'none' },
    { id: 'badge', type: 'text', x: 690, y: 870, width: 350, height: 70, rotation: 0, opacity: 1, locked: false, visible: true, zIndex: 2, text: 'RENEWED HOPE 2027', fontSize: 25, fontFamily: 'Montserrat', fontWeight: 700, color: '#ffffff', alignment: 'left', lineHeight: 1.2, letterSpacing: 1.2, textTransform: 'uppercase' },
    { id: 'footer', type: 'text', x: 90, y: 1270, width: 1020, height: 90, rotation: 0, opacity: 1, locked: false, visible: true, zIndex: 2, text: 'Progress • Unity • Service', fontSize: 30, fontFamily: 'Montserrat', fontWeight: 600, color: '#ffffff', alignment: 'center', lineHeight: 1.2, letterSpacing: 2, textTransform: 'uppercase' },
  ]);
}

export async function seedPremiumTinubuTemplate(
  prisma: PrismaClient,
  packId: string
): Promise<void> {
  await prisma.template.upsert({
    where: { id: TEMPLATE_ID },
    update: {
      name: 'APC Renewed Hope Presidential Premium',
      category: 'political',
      packId,
      latestVersion: VERSION,
    },
    create: {
      id: TEMPLATE_ID,
      name: 'APC Renewed Hope Presidential Premium',
      category: 'political',
      packId,
      latestVersion: VERSION,
    },
  });

  await prisma.templateVersion.upsert({
    where: { templateId_version: { templateId: TEMPLATE_ID, version: VERSION } },
    update: {
      name: 'APC Renewed Hope Presidential Premium v1',
      category: 'political',
      canvasWidth: 1200,
      canvasHeight: 1500,
      photoZoneX: 90,
      photoZoneY: 250,
      photoZoneWidth: 520,
      photoZoneHeight: 760,
      photoZoneShape: 'rounded-rect',
      photoZoneBorderRadius: 36,
      photoZoneLocked: true,
      layersJson: layersJson(),
      isPublished: true,
      publishedAt: new Date(),
      createdBy: 'system',
    },
    create: {
      id: `${TEMPLATE_ID}-v${VERSION}`,
      templateId: TEMPLATE_ID,
      version: VERSION,
      name: 'APC Renewed Hope Presidential Premium v1',
      category: 'political',
      canvasWidth: 1200,
      canvasHeight: 1500,
      photoZoneX: 90,
      photoZoneY: 250,
      photoZoneWidth: 520,
      photoZoneHeight: 760,
      photoZoneShape: 'rounded-rect',
      photoZoneBorderRadius: 36,
      photoZoneLocked: true,
      layersJson: layersJson(),
      isPublished: true,
      publishedAt: new Date(),
      createdBy: 'system',
    },
  });
}
