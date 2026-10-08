import 'dotenv/config';
import prisma from '../db/prisma';
import { env } from '../config/env';

async function seedCampaignPack(): Promise<void> {
  const existing = await prisma.campaignPack.findUnique({
    where: { id: env.CAMPAIGN_PACK_ID },
  });

  if (existing) {
    console.log('Campaign pack already exists, skipping seed');
    return;
  }

  const pack = await prisma.campaignPack.create({
    data: {
      id: env.CAMPAIGN_PACK_ID,
      name: 'Renewed Hope 2027',
      authorizedBy: env.CAMPAIGN_AUTHORIZED_BY || null,
      authorizationRef: null,
      disclaimer: env.CAMPAIGN_DISCLAIMER,
      brandPrimary: '#003366',
      brandSecondary: '#006633',
      brandAccent: '#FFCC00',
      defaultHeadline: 'Renewed Hope',
      defaultSubhead: 'Together we build a better future',
      shareTargets: ['whatsapp', 'facebook', 'x', 'telegram'],
    },
  });

  console.log('Created campaign pack:', pack.id);
}

async function seedFonts(): Promise<void> {
  const fonts = [
    {
      id: 'inter',
      name: 'Inter',
      family: 'Inter',
      weights: [400, 500, 600, 700],
      url: 'https://fonts.gstatic.com/s/inter/v12/UcC66FwMYPXlJq6mYmcg.woff2',
      unicodeRanges: ['Latin', 'Latin-Extended', 'African'],
      supportsYoruba: false,
      variable: true,
    },
    {
      id: 'noto-naskh-arabic',
      name: 'Noto Naskh Arabic',
      family: '"Noto Naskh Arabic"',
      weights: [400, 500, 600, 700],
      url: 'https://fonts.gstatic.com/s/notonaskharabic/v2/CwYFMyoOFYga4d2mM4i6Q.woff2',
      unicodeRanges: ['Arabic'],
      supportsYoruba: false,
      variable: false,
    },
  ];

  for (const font of fonts) {
    const existing = await prisma.fontDefinition.findUnique({ where: { id: font.id } });
    if (!existing) {
      await prisma.fontDefinition.create({ data: font });
      console.log('Created font:', font.id);
    }
  }
}

async function main(): Promise<void> {
  console.log('Starting database seed...');
  await seedCampaignPack();
  await seedFonts();
  console.log('Database seed completed');
}

main().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});