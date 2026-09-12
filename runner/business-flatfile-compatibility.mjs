const TN = 'tn-dhs-active-childcare-centers';
const OH = 'oh-dcy-publisher-open-childcare-centers';
export function flatfileReportingCompatibility(manifest) {
  const registry = manifest.dataset_id === 'national-business-registry';
  const version = manifest.publisher?.version;
  const ohio = registry && version === '2.15.0';
  const origin = manifest.tn_childcare_origin;
  if (ohio && ![null,'fresh','recovered'].includes(origin)) throw Error('Registry 2.15 requires an explicit Tennessee origin.');
  const tnFresh = registry && (version === '2.14.0' || (ohio && origin === 'fresh'));
  const tennessee = registry && (version === '2.13.0' || tnFresh || (ohio && origin === 'recovered'));
  const tnDependencies = manifest.dependencies?.filter(row=>row.dataset_id===TN) ?? [];
  const ohDependencies = manifest.dependencies?.filter(row=>row.dataset_id===OH) ?? [];
  if ((tennessee || ohio) && (manifest.publisher.id !== 'national-business-registry' || manifest.status !== 'published-partial')) throw Error('TN/OH export requires a published partial registry.');
  if (tnDependencies.length !== Number(tennessee)) throw Error('TN export requires exact supported registry version and source dependency.');
  if (ohDependencies.length !== Number(ohio)) throw Error('OH export requires exact registry 2.15 and source dependency.');
  if (!ohio && (Object.hasOwn(manifest,'oh_childcare_source') || Object.hasOwn(manifest,'tn_childcare_origin')
    || Object.keys(manifest.coverage ?? {}).some(key=>key.startsWith('oh_childcare_')))) throw Error('OH fields require exact registry 2.15.');
  if (tennessee && !(tnFresh ? /^tn-childcare-[a-f0-9-]{36}$/ : /^tn-childcare-recovered-[a-f0-9-]{36}$/).test(tnDependencies[0].release_id ?? '')) throw Error('TN export dependency origin differs.');
  if (!tennessee && Object.keys(manifest.coverage ?? {}).some(key=>key.startsWith('tn_childcare_'))) throw Error('TN coverage requires an enabled source origin.');
  return {ohio,tennessee,tnFresh,tnDependencies};
}
