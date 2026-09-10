/** Explicit supported reporting pairs; never infer compatibility from ordering. */
export function mapReportingCompatibility(manifest) {
  const version = manifest.publisher?.version;
  const ohio = version === '2.11.0';
  const origin = manifest.tn_childcare_origin;
  if (ohio && ![null, 'fresh', 'recovered'].includes(origin)) throw new Error('Map Tennessee origin differs.');
  const freshTn = version === '2.10.0' || (ohio && origin === 'fresh');
  const tennessee = version === '2.9.0' || freshTn || (ohio && origin === 'recovered');
  if ((ohio || tennessee) && manifest.publisher.id !== 'national-business-coverage-views') throw new Error('Map coverage publisher identity differs.');
  if (!ohio && (Object.hasOwn(manifest, 'tn_childcare_origin') || Object.hasOwn(manifest, 'oh_childcare_source')
    || Object.keys(manifest.coverage ?? {}).some(key => key.startsWith('oh_childcare_')))) throw new Error('Ohio map accounting requires exact coverage 2.11.0.');
  if (!tennessee && manifest.coverage?.tn_childcare_reporting) throw new Error('TN map reporting requires exact coverage version and origin support.');
  const registryVersion = ohio ? '2.15.0' : freshTn ? '2.14.0' : tennessee ? '2.13.0' : null;
  // Preserve the historical recovered-coverage contract; newer pairs require pins.
  if (ohio || freshTn) {
    const pins = manifest.dependencies?.filter(item => item.dataset_id === 'national-business-registry') ?? [];
    if (pins.length !== 1 || pins[0].publisher_version !== registryVersion) throw new Error(`Map requires exact registry ${registryVersion} and coverage ${version} pairing.`);
  }
  return { ohio, tennessee, freshTn, registryVersion };
}
