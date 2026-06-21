import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createNetworkConfig, SuiClientProvider, WalletProvider } from '@mysten/dapp-kit'
import { getJsonRpcFullnodeUrl, JsonRpcHTTPTransport } from '@mysten/sui/jsonRpc'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@mysten/dapp-kit/dist/index.css'
import './index.css'
import App from './App.tsx'

const { networkConfig } = createNetworkConfig({
  localnet: {
    transport: new JsonRpcHTTPTransport({ url: getJsonRpcFullnodeUrl('localnet') }),
    network: 'localnet',
  },
  devnet: {
    transport: new JsonRpcHTTPTransport({ url: getJsonRpcFullnodeUrl('devnet') }),
    network: 'devnet',
  },
  testnet: {
    transport: new JsonRpcHTTPTransport({ url: getJsonRpcFullnodeUrl('testnet') }),
    network: 'testnet',
  },
  mainnet: {
    transport: new JsonRpcHTTPTransport({ url: getJsonRpcFullnodeUrl('mainnet') }),
    network: 'mainnet',
  },
});

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider 
        networks={networkConfig} 
        defaultNetwork={
          (() => {
            const saved = localStorage.getItem('safesend_network');
            return (saved === 'testnet' || saved === 'mainnet') ? saved : 'mainnet';
          })()
        }
      >
        <WalletProvider autoConnect>
          <App />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  </StrictMode>,
)
