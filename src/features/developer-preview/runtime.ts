export const isDeveloperPreview = Boolean(
  import.meta.env?.DEV && import.meta.env.MODE === 'preview',
);

export const developerPreviewUserId = '00000000-0000-4000-8000-000000000001';
