import { createNetworkConfig } from '@mysten/dapp-kit';
import { getJsonRpcFullnodeUrl, JsonRpcHTTPTransport } from '@mysten/sui/jsonRpc';

const { networkConfig } = createNetworkConfig({
  testnet: {
    transport: new JsonRpcHTTPTransport({ url: getJsonRpcFullnodeUrl('testnet') }),
    network: 'testnet',
  },
});

console.log("networkConfig.testnet keys:", Object.keys(networkConfig.testnet));
console.log("networkConfig.testnet.client:", networkConfig.testnet.client);
console.log("networkConfig.testnet.client constructor name:", networkConfig.testnet.client.constructor.name);
console.log("networkConfig.testnet.client methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(networkConfig.testnet.client)));
