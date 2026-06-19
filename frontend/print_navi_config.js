import { getConfig } from '@naviprotocol/lending';

async function main() {
  try {
    const config = await getConfig();
    console.log("NAVI Protocol Config Keys:", Object.keys(config));
    console.log("Package ID:", config.packageId || config.package);
    console.log("Full Config JSON:");
    console.log(JSON.stringify(config, null, 2));
  } catch (err) {
    console.error("Error loading config:", err);
  }
}

main();
