import { SuiJsonRpcClient, JsonRpcHTTPTransport, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

const client = new SuiJsonRpcClient({
  transport: new JsonRpcHTTPTransport({ url: getJsonRpcFullnodeUrl('testnet') }),
});

const PACKAGE_ID = "0x132c8ca25aea9f76154bb4ad630b95f9f7575389cbf26db0e3b2ec069909844a";
const MODULE_NAME = "safesend";

async function main() {
  const created = await client.queryEvents({
    query: { MoveEventType: `${PACKAGE_ID}::${MODULE_NAME}::PaymentCreated` },
    limit: 1
  });
  console.log("PaymentCreated raw event:");
  console.log(JSON.stringify(created.data[0], null, 2));

  const cancelled = await client.queryEvents({
    query: { MoveEventType: `${PACKAGE_ID}::${MODULE_NAME}::PaymentCancelled` },
    limit: 1
  });
  console.log("\nPaymentCancelled raw event:");
  console.log(JSON.stringify(cancelled.data[0], null, 2));
}

main().catch(err => console.error(err));
