import { buildOkSpatialInventory } from '../runner/ok-childcare-spatial-inventory.mjs';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  console.log('node scripts/inspect-ok-childcare-spatial-inventory.mjs [--summary]\nOffline, checksum-bound Oklahoma Census search inventory; no requests, dispatch, or file writes.');
} else if (args.length === 0 || args.length === 1 && args[0] === '--summary') {
  const inventory = await buildOkSpatialInventory();
  if (args[0] === '--summary') delete inventory.items;
  console.log(JSON.stringify(inventory, null, 2));
} else {
  throw new Error('Only --summary or --help is supported.');
}
