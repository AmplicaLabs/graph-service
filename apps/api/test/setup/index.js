import { ApiPromise, WsProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { waitReady } from '@polkadot/wasm-crypto';
import { u8aToHex, u8aWrapBytes } from '@polkadot/util';
import { userPrivateConnections, userPrivateFollows, publicKey, userPublicFollows } from '@dsnp/frequency-schemas/dsnp';

const FREQUENCY_URL = process.env.FREQUENCY_URL || 'ws://127.0.0.1:9944';

function signPayloadWithKeyring(signingAccount, payload) {
  return { Sr25519: u8aToHex(signingAccount.sign(u8aWrapBytes(payload.toU8a()))) };
}

const sendStatusCb =
  (resolve) =>
  ({ status, events }) => {
    if (status.isInBlock || status.isFinalized) {
      const msaCreated = events.map(({ event }) => event).find((event) => event.method === 'MsaCreated');
      const schemaCreated = events.map(({ event }) => event).find((event) => event.method === 'SchemaCreated');
      if (msaCreated) {
        resolve(msaCreated.data.msaId);
      } else {
        resolve();
      }
      if (schemaCreated) {
        console.log('Schema Created: ' + schemaCreated.data);
        resolve(schemaCreated.data.schemaId);
      } else {
        resolve();
      }
    }
  };

const createViaDelegation = (api, provider) => async (keyUri, baseNonce) => {
  // Create delegate
  const keyring = new Keyring({ type: 'sr25519' });
  const delegator = keyring.addFromUri(keyUri);
  const rawPayload = { authorizedMsaId: 1, expiration: 100, schemaIds: [1, 2, 3, 4] };
  const addProviderPayload = api.registry.createType('PalletMsaAddProvider', rawPayload);
  const proof = signPayloadWithKeyring(delegator, addProviderPayload);

  const tx = api.tx.msa.createSponsoredAccountWithDelegation(delegator.address, proof, addProviderPayload.toU8a());
  await new Promise((resolve) => tx.signAndSend(provider, { nonce: baseNonce }, sendStatusCb(resolve)));

  const msaId = await api.query.msa.publicKeyToMsaId(delegator.address);
  if (msaId.isNone) throw new Error('Failed to create MSA');
  const msaIdStr = msaId.value.toString();

  console.log(keyUri + ' should have MSA Id ' + msaIdStr);
};

async function main() {
  await waitReady();
  const provider = new WsProvider(FREQUENCY_URL, 500, {}, 3_000);
  // Connect to the API
  const api = await ApiPromise.create({
    provider,
    // throwOnConnect: true,
  });
  await Promise.race([api.isReady, new Promise((_, reject) => setTimeout(() => reject(new Error('WS Connection Timeout')), 30_000))]);

  console.log('API Connected');
  const keyring = new Keyring({ type: 'sr25519' });
  const alice = keyring.addFromUri('//Alice');

  // Create Alice MSA
  await new Promise((resolve) => api.tx.msa.create().signAndSend(alice, sendStatusCb(resolve)));
  console.log('Alice should have MSA Id 1');
  // Create Alice Provider
  await new Promise((resolve) => api.tx.msa.createProvider('Alice').signAndSend(alice, sendStatusCb(resolve)));
  console.log('Alice (MSA Id 1) should be a provider now');

  let currentNonce = (await api.rpc.system.accountNextIndex(alice.address)).toBn().toNumber();
  console.log('Current nonce: ' + currentNonce);
  // Create Schemas
  const txSchema1 = api.tx.schemas.createSchema(JSON.stringify(userPublicFollows), 'AvroBinary', 'Paginated');
  await new Promise((resolve) => txSchema1.signAndSend(alice, { nonce: currentNonce }, sendStatusCb(resolve)));
  currentNonce++;
  console.log('Public Follow Schema created');
  const txSchema2 = api.tx.schemas.createSchema(JSON.stringify(userPrivateFollows), 'AvroBinary', 'Paginated');
  await new Promise((resolve) => txSchema2.signAndSend(alice, { nonce: currentNonce }, sendStatusCb(resolve)));
  currentNonce++;
  console.log('Private Follow Schema created');
  const txSchema3 = api.tx.schemas.createSchema(JSON.stringify(userPrivateConnections), 'AvroBinary', 'Paginated');
  await new Promise((resolve) => txSchema3.signAndSend(alice, { nonce: currentNonce }, sendStatusCb(resolve)));
  currentNonce++;
  console.log('Private Friend Schema created');
  const txSchema4 = api.tx.schemas.createSchemaViaGovernance(alice.publicKey, JSON.stringify(publicKey), 'AvroBinary', 'Itemized', ['AppendOnly']);
  let sudoTx = api.tx.sudo.sudo(txSchema4);
  await new Promise((resolve) => sudoTx.signAndSend(alice, { nonce: currentNonce }, sendStatusCb(resolve)));
  currentNonce++;
  console.log('Public Key Schema created');
  
  // Delegations
  const delegators = ['//Bob', '//Charlie', '//Dave', '//Eve', '//Ferdie'];
  for (let i = 0; i < 20; i++) {
    delegators.push(`//Bob//${i}`);
  }
  const create = createViaDelegation(api, alice);
  await Promise.all(delegators.map((delegator, i) => create(delegator, currentNonce + i)));
  
  console.log('Create Provider, Users, DSNP Graph Schemas, and Delegations complete. Exiting...');
}

main()
  .catch((r) => {
    console.error(r);
    process.exit(1);
  })
  .finally(process.exit);