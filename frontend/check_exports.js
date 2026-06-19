import * as client from '@mysten/sui/client';
console.log("Keys in @mysten/sui/client:", Object.keys(client));
try {
  const jsonRpc = await import('@mysten/sui/jsonRpc');
  console.log("Keys in @mysten/sui/jsonRpc:", Object.keys(jsonRpc));
} catch (e) {
  console.log("No @mysten/sui/jsonRpc module");
}
