// One-time (per fresh OpenFGA instance) setup: creates the "pulsedesk" store
// and writes the authorization model (fga-model.json) into it, then prints
// the FGA_STORE_ID / FGA_MODEL_ID to paste into .env.
//
// Run with: npx ts-node -r tsconfig-paths/register scripts/fga-bootstrap.ts
//
// Needed again any time the OpenFGA container is recreated, since it runs
// with the in-memory datastore in dev (see docker-compose.yml).
import { OpenFgaClient } from '@openfga/sdk';
import * as fs from 'fs';
import * as path from 'path';

const apiUrl = process.env.FGA_API_URL ?? 'http://localhost:8080';

async function main() {
  const bootstrapClient = new OpenFgaClient({ apiUrl });

  const stores = await bootstrapClient.listStores();
  let store = stores.stores?.find((s) => s.name === 'pulsedesk');
  if (!store) {
    store = await bootstrapClient.createStore({ name: 'pulsedesk' });
    console.log('Created store:', store.id);
  } else {
    console.log('Reusing existing store:', store.id);
  }

  const client = new OpenFgaClient({ apiUrl, storeId: store.id });
  const modelJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'fga-model.json'), 'utf-8'),
  );
  const model = await client.writeAuthorizationModel(modelJson);
  console.log('Authorization model id:', model.authorization_model_id);

  console.log('\nAdd these to .env:');
  console.log(`FGA_API_URL="${apiUrl}"`);
  console.log(`FGA_STORE_ID="${store.id}"`);
  console.log(`FGA_MODEL_ID="${model.authorization_model_id}"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
