import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiJsonRpcClient, JsonRpcHTTPTransport, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import fs from 'fs';
import http from 'http';

const NETWORK = process.env.SUI_NETWORK || 'mainnet';
const PACKAGE_ID = process.env.SUI_PACKAGE_ID || (
  NETWORK === 'mainnet'
    ? "0xa1267a62b0accbb5347d857b2524f4f0429a985a9a09d10608cfff2ec39f9f4c"
    : "0x61d20bc284636d32f29c006a4d4795140aeda77f8c345f6376047dfddc032635"
);
const MODULE_NAME = "safesend";

console.log(`[SafeSend Keeper] Initializing on network: ${NETWORK} with package: ${PACKAGE_ID}`);

// 1. Initialize Sui Client pointing to selected network
const suiClient = new SuiJsonRpcClient({
  transport: new JsonRpcHTTPTransport({ url: getJsonRpcFullnodeUrl(NETWORK) }),
});

// 2. Load the Keeper Keypair from env or local keystore
function loadKeypair() {
  if (process.env.KEEPER_PRIVATE_KEY) {
    console.log("[SafeSend Keeper] Loading private key from env KEEPER_PRIVATE_KEY...");
    const base64Key = process.env.KEEPER_PRIVATE_KEY;
    const rawBytes = Buffer.from(base64Key, 'base64');
    const secretKey = rawBytes.subarray(1);
    return Ed25519Keypair.fromSecretKey(secretKey);
  }

  const keystorePath = 'C:\\Users\\REGGIEHUBS\\.sui\\sui_config\\sui.keystore';
  if (!fs.existsSync(keystorePath)) {
    throw new Error(`Keystore file not found at ${keystorePath}. Please specify KEEPER_PRIVATE_KEY env variable.`);
  }
  const keys = JSON.parse(fs.readFileSync(keystorePath, 'utf8'));
  const base64Key = keys[0];
  const rawBytes = Buffer.from(base64Key, 'base64');
  const secretKey = rawBytes.subarray(1);
  return Ed25519Keypair.fromSecretKey(secretKey);
}

const keeperKeypair = loadKeypair();
const keeperAddress = keeperKeypair.getPublicKey().toSuiAddress();
console.log(`[SafeSend Keeper] Started with address: ${keeperAddress}`);

async function checkAndSettlePayments() {
  try {
    // A. Query all created payment events
    const createdEvents = await suiClient.queryEvents({
      query: { MoveEventType: `${PACKAGE_ID}::${MODULE_NAME}::PaymentCreated` },
      limit: 50,
      order: 'descending'
    });

    if (createdEvents.data.length === 0) {
      return;
    }

    const paymentIds = createdEvents.data.map(e => e.parsedJson.payment_id);

    // B. Fetch the live status of all these payment objects
    const objects = await suiClient.multiGetObjects({
      ids: paymentIds,
      options: { showContent: true }
    });

    const currentTime = Date.now();

    for (const obj of objects) {
      const id = obj.data?.objectId;
      const content = obj.data?.content;
      
      if (id && content && content.dataType === 'moveObject') {
        const fields = content.fields;
        const claimed = !!fields.claimed;
        const releaseTime = Number(fields.release_time);
        const recipient = fields.recipient;
        const recipientEmail = fields.recipient_email;
        const isEmailEscrow = recipientEmail && recipientEmail.length > 0;

        // C. If the payment is not claimed/cancelled, the safety window has expired, and it is NOT an email escrow, trigger settlement!
        if (!claimed && currentTime >= releaseTime && !isEmailEscrow) {
          console.log(`[SafeSend Keeper] Finalized payment detected! ID: ${id}, Recipient: ${recipient}. Triggering automatic release...`);
          
          try {
            const tx = new Transaction();
            tx.moveCall({
              target: `${PACKAGE_ID}::${MODULE_NAME}::release_payment`,
              typeArguments: ['0x2::sui::SUI'],
              arguments: [
                tx.object(id),
                tx.object("0x6") // Clock
              ]
            });

            const result = await suiClient.signAndExecuteTransaction({
              transaction: tx,
              signer: keeperKeypair
            });

            console.log(`[SafeSend Keeper] Auto-settled successfully! Tx Digest: ${result.digest}`);
          } catch (txErr) {
            console.error(`[SafeSend Keeper] Failed to settle payment ${id}:`, txErr.message);
          }
        }
      }
    }
  } catch (err) {
    console.error("[SafeSend Keeper] Error in execution loop:", err);
  }
}

// Start polling loop every 15 seconds
console.log("[SafeSend Keeper] Monitoring active escrows on-chain...");
setInterval(checkAndSettlePayments, 15000);
checkAndSettlePayments(); // initial run

// Create a simple HTTP server to act as a gas faucet for new users
const server = http.createServer(async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/faucet') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { address, email } = JSON.parse(body);
        if (!address) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing address' }));
          return;
        }

        console.log(`[SafeSend Keeper] Faucet request received for address: ${address}, email: ${email}`);

        // Only allow faucet on Testnet!
        if (NETWORK !== 'testnet') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Gas faucet is only available on Testnet.' }));
          return;
        }

        // A. Verify that there is at least one active escrow for this email
        const createdEvents = await suiClient.queryEvents({
          query: { MoveEventType: `${PACKAGE_ID}::${MODULE_NAME}::PaymentCreated` },
          limit: 50,
          order: 'descending'
        });

        const activeEscrows = [];
        const paymentIds = createdEvents.data.map(e => e.parsedJson.payment_id);
        
        if (paymentIds.length > 0) {
          const objects = await suiClient.multiGetObjects({
            ids: paymentIds,
            options: { showContent: true }
          });
          for (const obj of objects) {
            const id = obj.data?.objectId;
            const content = obj.data?.content;
            if (id && content && content.dataType === 'moveObject') {
              const fields = content.fields;
              const claimed = !!fields.claimed;
              const recipientEmail = fields.recipient_email;
              if (!claimed && recipientEmail && recipientEmail.toLowerCase() === email?.toLowerCase()) {
                activeEscrows.push(id);
              }
            }
          }
        }

        if (activeEscrows.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No active escrows found for this email address. Gas faucet is only available for users with pending escrows.' }));
          return;
        }

        // B. Check the balance of the recipient address
        const balanceRes = await suiClient.getBalance({ owner: address });
        const balanceNum = Number(balanceRes.totalBalance) / 1e9;
        if (balanceNum >= 0.005) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Address already has sufficient gas.', balance: balanceNum }));
          return;
        }

        // C. Send 0.006 SUI to the address (enough for claim gas + buffer)
        console.log(`[SafeSend Keeper] Sending 0.006 SUI gas to new user ${address}...`);
        const tx = new Transaction();
        const [coin] = tx.splitCoins(tx.gas, [6000000n]); // 0.006 SUI in MIST
        tx.transferObjects([coin], address);
        
        const result = await suiClient.signAndExecuteTransaction({
          transaction: tx,
          signer: keeperKeypair
        });

        console.log(`[SafeSend Keeper] Gas transfer successful! Tx: ${result.digest}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, txDigest: result.digest }));
      } catch (err) {
        console.error('[SafeSend Keeper] Faucet error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(3001, () => {
  console.log('[SafeSend Keeper] Gas Faucet Server listening on port 3001');
});
