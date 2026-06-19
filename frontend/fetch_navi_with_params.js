async function main() {
  const markets = ['sui', 'main', '1', 'volo'];
  for (const m of markets) {
    const url = `https://open-api.naviprotocol.io/api/navi/config?env=testnet&sdk=1.2.0&market=${m}`;
    console.log(`Fetching from: ${url}`);
    try {
      const res = await fetch(url);
      console.log(`Status: ${res.status}`);
      if (res.status === 200) {
        const json = await res.json();
        console.log("Success! Data:");
        console.log(JSON.stringify(json, null, 2));
        break;
      }
    } catch (e) {
      console.error(e);
    }
  }
}

main();
