import React, { useState, useEffect } from 'react';
import { 
  useCurrentAccount, 
  useSignAndExecuteTransaction, 
  useSuiClient,
  useDisconnectWallet,
  ConnectModal,
  useSuiClientContext
} from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { 
  ShieldCheck, 
  Send, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Lock,
  Unlock,
  Coins,
  History,
  Mail,
  LogOut,
  Sparkles,
  Copy,
  Check,
  ChevronDown,
  Wallet,
  BookOpen
} from 'lucide-react';
import './App.css';

const MODULE_NAME = "safesend";

interface PaymentItem {
  id: string;
  sender: string;
  recipient: string;
  recipientEmail: string;
  amount: number;
  coinType: string;
  releaseTime: number;
  claimed: boolean;
  isCancelled?: boolean;
}

import { 
  computeZkLoginAddress, 
  decodeJwt, 
  generateNonce, 
  generateRandomness, 
  getZkLoginSignature,
  genAddressSeed
} from '@mysten/sui/zklogin';
import { toBase64, fromHex } from '@mysten/sui/utils';

function bigIntToBase64(n: bigint): string {
  let hex = n.toString(16);
  if (hex.length % 2 !== 0) {
    hex = '0' + hex;
  }
  return toBase64(fromHex(hex));
}

const MOVE_STRUCT_CODE = `public struct SafePayment<phantom T> has key, store {
    id: UID,
    sender: address,
    recipient: address, // derived zkLogin address or standard wallet address
    recipient_email: String, // email address if sent to email, otherwise empty
    balance: Option<Coin<T>>,
    release_time: u64, // timestamp in ms when payment becomes non-reversible
    claimed: bool,
}`;

const ZKLOGIN_SALT_CODE = `// Derive a secure deterministic 128-bit BigInt salt from email
async function getDeterministicSalt(email: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(email.toLowerCase().trim() + "_safesend_salt_secret_key_2026");
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  let val = 0n;
  for (let i = 0; i < 16; i++) {
    val = (val << 8n) + BigInt(hashArray[i]);
  }
  return val.toString();
}`;

const KEEPER_AUTOCLAIM_CODE = `// Keeper loop to check and auto-settle expired escrows on-chain
async function checkAndSettlePayments() {
  const createdEvents = await suiClient.queryEvents({
    query: { MoveEventType: \\\`\\\${PACKAGE_ID}::safesend::PaymentCreated\\\` },
    limit: 50,
  });
  
  for (const event of createdEvents.data) {
    const fields = event.parsedJson;
    if (!fields.claimed && Date.now() >= Number(fields.release_time)) {
      const tx = new Transaction();
      tx.moveCall({
        target: \\\`\\\${PACKAGE_ID}::safesend::release_payment\\\`,
        typeArguments: ['0x2::sui::SUI'],
        arguments: [tx.object(fields.payment_id), tx.object(\"0x6\")]
      });
      await suiClient.signAndExecuteTransaction({ transaction: tx, signer: keeperKeypair });
    }
  }
}`;

const INTEGRATION_CODE = `import { Transaction } from '@mysten/sui/transactions';

const tx = new Transaction();
const amountInMist = BigInt(amount * 1e9);
const [coinToDeposit] = tx.splitCoins(tx.gas, [amountInMist]);

tx.moveCall({
  target: \\\`\\\${PACKAGE_ID}::safesend::create_payment\\\`,
  typeArguments: ['0x2::sui::SUI'],
  arguments: [
    tx.pure.address(recipientAddress),
    tx.pure.string(recipientEmail),
    coinToDeposit,
    tx.pure.u64(lockDurationMs),
    tx.object(\"0x6\"), // clock
  ],
});`;

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "555776269604-demo-client-id.apps.googleusercontent.com";

const LogoSVG = ({ size = 36 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
    <defs>
      <linearGradient id="dropletGradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#1E80F3" />
        <stop offset="60%" stopColor="#38BDF8" />
        <stop offset="100%" stopColor="#B3E0FF" />
      </linearGradient>
    </defs>
    
    <path 
      d="M50 8 C68 35, 82 55, 82 70 A 32 32 0 0 1 18 70 C18 55, 32 35, 50 8 Z" 
      stroke="url(#dropletGradient)" 
      strokeWidth="8" 
      fill="none" 
    />
    
    <path 
      d="M 59 36 C 59 27, 41 27, 41 38 C 41 44, 49 46, 50 48" 
      stroke="#FFFFFF" 
      strokeWidth="11" 
      strokeLinecap="round" 
      fill="none" 
    />
    
    <path 
      d="M 50 48 C 51 50, 59 52, 59 58 C 59 69, 41 69, 41 60" 
      stroke="#1E80F3" 
      strokeWidth="11" 
      strokeLinecap="round" 
      fill="none" 
    />
    
    <path 
      d="M 28 73 C 38 70, 42 78, 50 75 C 58 72, 62 80, 72 77" 
      stroke="#38BDF8" 
      strokeWidth="5" 
      strokeLinecap="round" 
      fill="none" 
    />
    <path 
      d="M 24 81 C 34 78, 38 86, 50 83 C 62 80, 66 88, 76 85" 
      stroke="#1E80F3" 
      strokeWidth="5" 
      strokeLinecap="round" 
      fill="none" 
    />
  </svg>
);

// Derive a secure deterministic 128-bit BigInt salt from email for zkLogin address mapping
async function getDeterministicSalt(email: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(email.toLowerCase().trim() + "_safesend_salt_secret_key_2026");
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  let val = 0n;
  for (let i = 0; i < 16; i++) {
    val = (val << 8n) + BigInt(hashArray[i]);
  }
  return val.toString();
}

function App() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  const { mutate: disconnectWallet } = useDisconnectWallet();

  // Network Selector Context
  const { network, selectNetwork } = useSuiClientContext();
  const CURRENT_PACKAGE_ID = network === 'mainnet' 
    ? (import.meta.env.VITE_MAINNET_PACKAGE_ID || "0xa1267a62b0accbb5347d857b2524f4f0429a985a9a09d10608cfff2ec39f9f4c") 
    : (import.meta.env.VITE_TESTNET_PACKAGE_ID || "0x61d20bc284636d32f29c006a4d4795140aeda77f8c345f6376047dfddc032635");

  const CURRENT_TREASURY = network === 'mainnet'
    ? (import.meta.env.VITE_MAINNET_TREASURY || "0x804450ab336a932a58bc75dc7968b1903b685995a0e14c75babc3e4c7c84ff79")
    : (import.meta.env.VITE_TESTNET_TREASURY || "0x804450ab336a932a58bc75dc7968b1903b685995a0e14c75babc3e4c7c84ff79");

  // Active User session (Wallet or Google zkLogin)
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [zkLoginCredentials, setZkLoginCredentials] = useState<any | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [zkLoginLoading, setZkLoginLoading] = useState(false);
  const [zkLoginStatus, setZkLoginStatus] = useState('');

  const [activeBalance, setActiveBalance] = useState<string>('0.0000');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyAddress = () => {
    if (!activeAddress) return;
    navigator.clipboard.writeText(activeAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDisconnect = () => {
    if (account) {
      disconnectWallet();
    }
    handleLogout();
    setShowUserDropdown(false);
  };

  // Automatically logout zkLogin session if browser wallet is connected
  useEffect(() => {
    if (account) {
      handleLogout();
    }
  }, [account]);

  const loadBalance = async () => {
    if (!activeAddress) return;
    try {
      const { epoch } = await suiClient.getLatestSuiSystemState();
      
      // Auto-invalidate expired zkLogin sessions
      if (zkLoginCredentials && Number(epoch) > Number(zkLoginCredentials.maxEpoch)) {
        console.warn("zkLogin session epoch expired. Logging out.");
        handleLogout();
        alert("Your zkLogin secure session has expired (Sui epoch has advanced). Please log in with Google again to start a new secure session.");
        return;
      }

      const balanceRes = await suiClient.getBalance({
        owner: activeAddress,
      });
      const suiBal = Number(balanceRes.totalBalance) / 1e9;
      setActiveBalance(suiBal.toFixed(4));
    } catch (err) {
      console.error("Failed to fetch balance:", err);
    }
  };

  // Active address representing current user
  const activeAddress = account 
    ? account.address 
    : (zkLoginCredentials ? zkLoginCredentials.address : null);

  // Navigation
  const [activeTab, setActiveTab] = useState<'send' | 'manage' | 'history'>('send');

  // Layout views (App Dashboard vs GitBook Developer Docs)
  const [viewMode, setViewMode] = useState<'app' | 'docs'>('app');
  const [activeDocId, setActiveDocId] = useState<string>('intro');
  const [paymentNote, setPaymentNote] = useState<string>('');
  const [docCopied, setDocCopied] = useState<{[key: string]: boolean}>({});

  const handleCopyDocCode = (codeKey: string, codeText: string) => {
    navigator.clipboard.writeText(codeText);
    setDocCopied(prev => ({ ...prev, [codeKey]: true }));
    setTimeout(() => {
      setDocCopied(prev => ({ ...prev, [codeKey]: false }));
    }, 2000);
  };

  // Send Form State
  const [sendMode, setSendMode] = useState<'wallet' | 'email'>('wallet');
  const [recipient, setRecipient] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [coinType, setCoinType] = useState('SUI');
  const [lockDuration, setLockDuration] = useState('60'); // default 60s (1 min) for quick testing/demo
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);

  // Manage States
  const [sentPayments, setSentPayments] = useState<PaymentItem[]>([]);
  const [receivedPayments, setReceivedPayments] = useState<PaymentItem[]>([]);
  const [historyPayments, setHistoryPayments] = useState<PaymentItem[]>([]);
  const [isLoadingPayments, setIsLoadingPayments] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Flow Animation State
  const [animatingStep, setAnimatingStep] = useState<number>(0);

  // Parse Google OAuth redirect or auto-login from localstorage
  // Load session from local storage on mount and handle redirect hash
  useEffect(() => {
    // 1. Check if redirect from Google zkLogin
    const hash = window.location.hash;
    if (hash && hash.includes('id_token=')) {
      const params = new URLSearchParams(hash.substring(1));
      const idToken = params.get('id_token');
      if (idToken) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        handleGoogleRedirect(idToken);
      }
    }

    // 2. Load persistent zkLogin session
    const savedCreds = localStorage.getItem('safesend_zklogin_creds');
    if (savedCreds) {
      try {
        const credentials = JSON.parse(savedCreds);
        setZkLoginCredentials(credentials);
        setConnectedEmail(credentials.email);
      } catch (e) {
        console.error("Failed to parse saved credentials:", e);
      }
    }
  }, []);

  // Synchronize React navigation state with URL pathname route
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname; // e.g. "/dashboard/send", "/docs/contract"
      const route = path.replace(/^\//, ''); // strip leading slash
      
      if (route.startsWith('docs')) {
        setViewMode('docs');
        const parts = route.split('/');
        const docId = parts[1] || 'intro';
        if (['intro', 'contract', 'zklogin', 'keeper', 'integration'].includes(docId)) {
          setActiveDocId(docId);
        }
      } else if (route.startsWith('dashboard')) {
        setViewMode('app');
        const parts = route.split('/');
        const tabId = parts[1];
        if (tabId === 'send') setActiveTab('send');
        else if (tabId === 'escrows') setActiveTab('manage');
        else if (tabId === 'history') setActiveTab('history');
      } else {
        setViewMode('app');
      }
    };

    window.addEventListener('popstate', handlePopState);
    
    // Run on initial mount
    const initialPath = window.location.pathname;
    if (initialPath && initialPath !== '/') {
      // Small timeout to allow activeAddress state to load from storage
      setTimeout(handlePopState, 50);
    }

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Sync state modifications back to the URL pathname route
  useEffect(() => {
    // Skip if we are currently redirecting from Google OAuth
    if (window.location.hash.includes('id_token=')) return;

    let targetPath = '/';
    if (viewMode === 'docs') {
      targetPath = `/docs/${activeDocId}`;
    } else if (activeAddress) {
      const tabSlug = activeTab === 'send' ? 'send' : activeTab === 'manage' ? 'escrows' : 'history';
      targetPath = `/dashboard/${tabSlug}`;
    }

    // Only push to history if it actually changes the path to avoid loops
    if (window.location.pathname !== targetPath) {
      window.history.pushState(null, '', targetPath);
    }
  }, [viewMode, activeTab, activeDocId, activeAddress]);

  const handleGoogleRedirect = async (idToken: string) => {
    setZkLoginLoading(true);
    setZkLoginStatus('Decoding JWT token...');
    try {
      const decoded = decodeJwt(idToken);
      const email = (decoded as any).email || "";
      const sub = (decoded as any).sub || "";
      if (!email) {
        throw new Error("No email address found in Google token");
      }
      if (!sub) {
        throw new Error("No subject ID found in Google token");
      }

      setZkLoginStatus('Retrieving ephemeral session params...');
      const ephemeralPrivateKey = localStorage.getItem('safesend_ephemeral_private_key');
      const randomness = localStorage.getItem('safesend_randomness');
      const maxEpochStr = localStorage.getItem('safesend_max_epoch');

      if (!ephemeralPrivateKey || !randomness || !maxEpochStr) {
        throw new Error("Missing ephemeral login parameters. Session might have timed out.");
      }

      setZkLoginStatus('Deriving secure zkLogin address...');
      const salt = await getDeterministicSalt(email);

      const address = computeZkLoginAddress({
        claimName: 'sub',
        claimValue: sub,
        iss: decoded.iss,
        aud: decoded.aud,
        userSalt: BigInt(salt),
        legacyAddress: false,
      });

      setZkLoginStatus('Requesting Zero-Knowledge Proof from prover...');
      const ephemeralKeyPair = Ed25519Keypair.fromSecretKey(ephemeralPrivateKey);
      const ephemeralPubKeyStr = ephemeralKeyPair.getPublicKey().toSuiPublicKey();
      const randomnessBigInt = BigInt(randomness);
      const saltBigInt = BigInt(salt);

      const response = await fetch('/api/sui-prover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "shinami_zkp_createZkLoginProof",
          params: [
            idToken,
            maxEpochStr,
            ephemeralPubKeyStr,
            bigIntToBase64(randomnessBigInt),
            bigIntToBase64(saltBigInt),
            'sub'
          ]
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Prover service failure: ${errorText}`);
      }

      const rpcResponse = await response.json();
      if (rpcResponse.error) {
        throw new Error(rpcResponse.error.message || `Shinami RPC error: ${JSON.stringify(rpcResponse.error)}`);
      }
      const zkProof = rpcResponse.result.zkProof;

      setZkLoginStatus('zkLogin Authentication Success!');
      const credentials = {
        address,
        email,
        ephemeralPrivateKey,
        randomness,
        maxEpoch: maxEpochStr,
        salt,
        zkProof,
        decoded,
        jwt: idToken
      };

      localStorage.setItem('safesend_zklogin_creds', JSON.stringify(credentials));
      setZkLoginCredentials(credentials);
      setConnectedEmail(email);

      // Clean temporary storage
      localStorage.removeItem('safesend_ephemeral_private_key');
      localStorage.removeItem('safesend_randomness');
      localStorage.removeItem('safesend_max_epoch');

    } catch (err: any) {
      console.error("zkLogin setup failed:", err);
      alert(`zkLogin Authentication Failed: ${err.message}`);
    } finally {
      setZkLoginLoading(false);
      setZkLoginStatus('');
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setZkLoginLoading(true);
      setZkLoginStatus('Querying current Sui epoch...');
      const { epoch } = await suiClient.getLatestSuiSystemState();
      const maxEpoch = Number(epoch) + 2;

      const ephemeralKeyPair = Ed25519Keypair.generate();
      const ephemeralPrivateKey = ephemeralKeyPair.getSecretKey();
      const randomness = generateRandomness();
      const nonce = generateNonce(ephemeralKeyPair.getPublicKey(), maxEpoch, randomness);

      // Store in localStorage
      localStorage.setItem('safesend_ephemeral_private_key', ephemeralPrivateKey);
      localStorage.setItem('safesend_randomness', randomness);
      localStorage.setItem('safesend_max_epoch', maxEpoch.toString());

      setZkLoginStatus('Redirecting to Google Secure Login...');
      const redirectUri = encodeURIComponent(window.location.origin);
      const googleUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${redirectUri}&response_type=id_token&scope=openid%20email%20profile&nonce=${nonce}`;
      window.location.href = googleUrl;
    } catch (err: any) {
      console.error("Google Login initialization failed:", err);
      alert(`Google Login failed to start: ${err.message}`);
      setZkLoginLoading(false);
    }
  };

  const executeZkLoginTx = async (tx: Transaction): Promise<any> => {
    if (!zkLoginCredentials) throw new Error("No active zkLogin session.");

    tx.setSender(zkLoginCredentials.address);
    const transactionBytes = await tx.build({ client: suiClient });

    const ephemeralKeyPair = Ed25519Keypair.fromSecretKey(zkLoginCredentials.ephemeralPrivateKey);
    const { signature: ephemeralSig } = await ephemeralKeyPair.signTransaction(transactionBytes);

    const addressSeed = genAddressSeed(
      BigInt(zkLoginCredentials.salt),
      'sub',
      zkLoginCredentials.decoded.sub,
      zkLoginCredentials.decoded.aud
    ).toString();

    const zkLoginSignature = getZkLoginSignature({
      inputs: {
        ...zkLoginCredentials.zkProof,
        addressSeed,
      },
      maxEpoch: Number(zkLoginCredentials.maxEpoch),
      userSignature: ephemeralSig,
    });

    const result = await suiClient.executeTransactionBlock({
      transactionBlock: transactionBytes,
      signature: zkLoginSignature,
      options: { showEffects: true, showEvents: true }
    });

    return result;
  };

  const handleLogout = () => {
    setZkLoginCredentials(null);
    setConnectedEmail(null);
    localStorage.removeItem('safesend_zklogin_creds');
  };

  // Sync payments when user logins, switches network, or switches tabs
  useEffect(() => {
    if (activeAddress) {
      loadPayments();
      loadBalance();
    } else {
      setSentPayments([]);
      setReceivedPayments([]);
      setHistoryPayments([]);
      setActiveBalance('0.0000');
    }
  }, [activeAddress, connectedEmail, network]);

  // Periodic poll to show countdowns and fetch new items
  useEffect(() => {
    if (activeAddress) {
      const interval = setInterval(() => {
        loadPayments();
        loadBalance();
      }, 15000);
      return () => clearInterval(interval);
    }
  }, [activeAddress, connectedEmail]);

  // Trigger gas faucet if user has a pending received escrow and 0 SUI balance
  useEffect(() => {
    const triggerFaucetIfEligible = async () => {
      if (zkLoginCredentials && parseFloat(activeBalance) < 0.005 && receivedPayments.length > 0) {
        const hasPendingReceived = receivedPayments.some(p => !p.claimed);
        if (hasPendingReceived) {
          try {
            console.log("Requesting gas from Keeper Faucet...");
            const res = await fetch('http://localhost:3001/faucet', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                address: zkLoginCredentials.address,
                email: zkLoginCredentials.email
              })
            });
            if (res.ok) {
              const data = await res.json();
              console.log("Faucet response:", data);
              // Reload balance after a short delay
              setTimeout(() => {
                loadBalance();
              }, 2000);
            }
          } catch (err) {
            console.error("Failed to request gas from Keeper Faucet:", err);
          }
        }
      }
    };

    triggerFaucetIfEligible();
  }, [activeBalance, receivedPayments, zkLoginCredentials]);

  // Query events and direct on-chain state to load active and history payments
  const loadPayments = async () => {
    if (!activeAddress) return;
    setIsLoadingPayments(true);
    setErrorMessage(null);
    try {
      // A. Query all created payments
      const createdEvents = await suiClient.queryEvents({
        query: { MoveEventType: `${CURRENT_PACKAGE_ID}::${MODULE_NAME}::PaymentCreated` },
        limit: 50,
        order: 'descending'
      });

      // B. Query all claimed/settled events
      const claimedEvents = await suiClient.queryEvents({
        query: { MoveEventType: `${CURRENT_PACKAGE_ID}::${MODULE_NAME}::PaymentClaimed` },
        limit: 50
      });
      const claimedIds = new Set(claimedEvents.data.map((e: any) => e.parsedJson.payment_id));

      // C. Query all cancelled events
      const cancelledEvents = await suiClient.queryEvents({
        query: { MoveEventType: `${CURRENT_PACKAGE_ID}::${MODULE_NAME}::PaymentCancelled` },
        limit: 50
      });
      const cancelledIds = new Set(cancelledEvents.data.map((e: any) => e.parsedJson.payment_id));

      // D. Fetch the live status of all payment objects
      const paymentIds = createdEvents.data.map((evt: any) => evt.parsedJson.payment_id);
      const objectStateMap = new Map<string, { claimed: boolean; recipient: string; recipient_email: string }>();
      
      if (paymentIds.length > 0) {
        const objects = await suiClient.multiGetObjects({
          ids: paymentIds,
          options: { showContent: true }
        });
        objects.forEach((obj: any) => {
          const id = obj.data?.objectId;
          const content = obj.data?.content;
          if (id && content && content.dataType === 'moveObject') {
            const fields = content.fields;
            objectStateMap.set(id, {
              claimed: !!fields.claimed,
              recipient: fields.recipient,
              recipient_email: fields.recipient_email
            });
          }
        });
      }

      const allPayments: PaymentItem[] = createdEvents.data.map((evt: any) => {
        const payload = evt.parsedJson;
        const pid = payload.payment_id;
        const liveState = objectStateMap.get(pid);
        const isClaimed = liveState ? liveState.claimed : true;
        const recipientAddr = liveState ? liveState.recipient : payload.recipient;
        const recipientEmailStr = liveState ? liveState.recipient_email : payload.recipient_email;

        return {
          id: pid,
          sender: payload.sender,
          recipient: recipientAddr,
          recipientEmail: recipientEmailStr,
          amount: Number(payload.amount) / 1e9,
          coinType: "SUI",
          releaseTime: Number(payload.release_time),
          claimed: isClaimed || claimedIds.has(pid) || cancelledIds.has(pid),
          isCancelled: cancelledIds.has(pid)
        };
      });

      // Filter active (unsettled) payments
      const active = allPayments.filter(p => !p.claimed);

      const activeSent = active.filter(p => p.sender.toLowerCase() === activeAddress.toLowerCase());
      const activeRec = active.filter(p => {
        const isWalletMatch = p.recipient.toLowerCase() === activeAddress.toLowerCase();
        const isEmailMatch = connectedEmail && p.recipientEmail.toLowerCase() === connectedEmail.toLowerCase();
        return isWalletMatch || isEmailMatch;
      });

      setSentPayments(activeSent);
      setReceivedPayments(activeRec);

      // History payments
      const history = allPayments.filter(p => p.claimed);
      const userHistory = history.filter(p => {
        const isSender = p.sender.toLowerCase() === activeAddress.toLowerCase();
        const isRecipient = p.recipient.toLowerCase() === activeAddress.toLowerCase();
        const isEmailRecipient = connectedEmail && p.recipientEmail.toLowerCase() === connectedEmail.toLowerCase();
        return isSender || isRecipient || isEmailRecipient;
      });
      setHistoryPayments(userHistory);

    } catch (err: any) {
      console.error("Failed to load on-chain payments history:", err);
    } finally {
      setIsLoadingPayments(false);
    }
  };

  const handleSendPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAddress) {
      setErrorMessage("Please connect a wallet or log in with Google first!");
      return;
    }

    let finalRecipient = recipient;
    let finalEmail = "";

    if (sendMode === 'email') {
      if (!recipientEmail) {
        setErrorMessage("Please enter the recipient email.");
        return;
      }
      finalEmail = recipientEmail.trim().toLowerCase();
      // Derive recipient derived zkLogin address deterministically from their email using the official zkLogin address calculation
      const finalEmailSalt = await getDeterministicSalt(finalEmail);
      finalRecipient = computeZkLoginAddress({
        claimName: 'email',
        claimValue: finalEmail,
        iss: 'https://accounts.google.com',
        aud: GOOGLE_CLIENT_ID,
        userSalt: BigInt(finalEmailSalt),
        legacyAddress: false,
      });
    } else {
      if (!recipient) {
        setErrorMessage("Please enter the recipient Sui wallet address.");
        return;
      }
    }

    if (!amount) {
      setErrorMessage("Please specify the amount.");
      return;
    }

    const userBalanceNum = parseFloat(activeBalance);
    const amountNum = parseFloat(amount);
    const gasBuffer = 0.005; // 0.005 SUI gas buffer
    if (userBalanceNum < amountNum + gasBuffer) {
      setErrorMessage(`Insufficient balance! You have ${activeBalance} SUI, but you need at least ${(amountNum + gasBuffer).toFixed(4)} SUI (including 0.005 SUI gas buffer) to complete this transfer.`);
      return;
    }

    setIsSending(true);
    setSendSuccess(null);
    setErrorMessage(null);
    setAnimatingStep(1); 

    try {
      const tx = new Transaction();
      const amountInMist = BigInt(parseFloat(amount) * 1e9);
      const [coinToDeposit] = tx.splitCoins(tx.gas, [amountInMist]);

      tx.moveCall({
        target: `${CURRENT_PACKAGE_ID}::${MODULE_NAME}::create_payment`,
        typeArguments: ['0x2::sui::SUI'],
        arguments: [
          tx.pure.address(finalRecipient),
          tx.pure.string(finalEmail),
          coinToDeposit,
          tx.pure.u64(BigInt(lockDuration) * 1000n),
          tx.object("0x6"), // Clock
        ],
      });

      setAnimatingStep(2); 

      // Support execution from either connected extension wallet or zkLogin session
      if (zkLoginCredentials) {
        const result = await executeZkLoginTx(tx);
        console.log("zkLogin Execution result:", result);
        setAnimatingStep(3); 
        setSendSuccess(`Payment of ${amount} SUI successfully locked in reversible escrow!`);
        setTimeout(() => {
          loadPayments();
          setAnimatingStep(0);
          setRecipient('');
          setRecipientEmail('');
          setAmount('');
        }, 3000);
      } else {
        signAndExecuteTransaction(
          {
            transaction: tx,
            chain: network === 'mainnet' ? 'sui:mainnet' : 'sui:testnet',
          },
          {
            onSuccess: (result) => {
              console.log("Wallet Execution result:", result);
              setAnimatingStep(3); 
              setSendSuccess(`Payment of ${amount} SUI successfully locked in reversible escrow!`);
              setTimeout(() => {
                loadPayments();
                setAnimatingStep(0);
                setRecipient('');
                setRecipientEmail('');
                setAmount('');
              }, 3000);
            },
            onError: (err) => {
              console.error("Wallet Execution failed:", err);
              setErrorMessage(`Failed to execute payment: ${err.message}`);
              setAnimatingStep(0);
            }
          }
        );
      }
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred.");
      setAnimatingStep(0);
    } finally {
      setIsSending(false);
    }
  };

  const handleClaimPayment = async (paymentId: string) => {
    if (!activeAddress) return;
    const userBalanceNum = parseFloat(activeBalance);
    if (userBalanceNum < 0.005) {
      alert(`Insufficient balance for gas! You have ${activeBalance} SUI, but claiming manually requires a gas fee (approx 0.005 SUI). Please wait for the SafeSend keeper to auto-settle the escrow for you (at zero gas cost to you) after the safety window closes, or deposit SUI to this wallet.`);
      return;
    }
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${CURRENT_PACKAGE_ID}::${MODULE_NAME}::claim_payment`,
        typeArguments: ['0x2::sui::SUI'],
        arguments: [
          tx.object(paymentId),
          tx.object("0x6"), // Clock
        ],
      });

      if (zkLoginCredentials) {
        const result = await executeZkLoginTx(tx);
        console.log("Claim transaction hash:", result.digest);
        alert("Payment claimed successfully!");
        loadPayments();
      } else {
        signAndExecuteTransaction({
          transaction: tx,
          chain: network === 'mainnet' ? 'sui:mainnet' : 'sui:testnet'
        }, {
          onSuccess: () => {
            alert("Payment claimed successfully!");
            setTimeout(() => loadPayments(), 3000);
          },
          onError: (err) => {
            alert(`Claim failed: ${err.message}`);
          }
        });
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleCancelPayment = async (paymentId: string) => {
    if (!activeAddress) return;
    const userBalanceNum = parseFloat(activeBalance);
    if (userBalanceNum < 0.005) {
      alert(`Insufficient balance for gas! You have ${activeBalance} SUI, but cancelling requires a gas fee (approx 0.005 SUI). Please deposit SUI to this wallet to execute the cancellation.`);
      return;
    }
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${CURRENT_PACKAGE_ID}::${MODULE_NAME}::cancel_payment`,
        typeArguments: ['0x2::sui::SUI'],
        arguments: [
          tx.object(paymentId),
          tx.object("0x6") // Clock
        ],
      });

      if (zkLoginCredentials) {
        const result = await executeZkLoginTx(tx);
        console.log("Cancel transaction hash:", result.digest);
        alert("Payment recalled and refunded successfully!");
        loadPayments();
      } else {
        signAndExecuteTransaction({
          transaction: tx,
          chain: network === 'mainnet' ? 'sui:mainnet' : 'sui:testnet'
        }, {
          onSuccess: () => {
            alert("Payment recalled and refunded successfully!");
            loadPayments();
          },
          onError: (err) => {
            alert(`Cancellation failed: ${err.message}`);
          }
        });
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const renderFooter = () => (
    <footer className="landing-footer">
      <div className="footer-top">
        <div className="footer-brand">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <LogoSVG size={36} />
            <h3 style={{ fontSize: '1.2rem', margin: 0, color: 'var(--text-white)', fontWeight: 800, letterSpacing: '-0.3px' }}>Sui SafeSend</h3>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-light)', margin: '10px 0 15px', textAlign: 'left', lineHeight: 1.4 }}>
            Secure, reversible peer-to-peer crypto payments powered by zkLogin.
          </p>
          <div 
            className="footer-btn-docs" 
            onClick={() => { setViewMode('docs'); setActiveDocId('intro'); window.scrollTo(0, 0); }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <BookOpen size={20} color="var(--blue-sky)" />
              <div style={{ textAlign: 'left' }}>
                <span style={{ display: 'block', fontWeight: 700, fontSize: '0.92rem' }}>Docs</span>
                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-light)' }}>Explore developer guides</span>
              </div>
            </div>
            <span style={{ fontSize: '1.1rem', color: 'var(--text-light)' }}>↗</span>
          </div>
        </div>

        <div className="footer-links-grid">
          <div className="footer-col">
            <span className="footer-col-title">Products</span>
            <a className="footer-link" onClick={() => { setViewMode('app'); window.scrollTo(0, 0); }}>SafeSend App</a>
            <a className="footer-link" onClick={() => setShowEmailModal(true)}>zkLogin Wallet</a>
            <a className="footer-link" onClick={() => setShowEmailModal(true)}>Escrow Vault</a>
          </div>
          <div className="footer-col">
            <span className="footer-col-title">Protocol</span>
            <a className="footer-link" href="https://github.com/0xnald/sui-safesend/tree/main/safesend" target="_blank" rel="noopener noreferrer">Smart Contract</a>
            <a className="footer-link" href="https://github.com/0xnald/sui-safesend" target="_blank" rel="noopener noreferrer">Keeper Bot</a>
            <a className="footer-link" href={network === 'mainnet' ? "https://suivision.xyz" : "https://testnet.suivision.xyz"} target="_blank" rel="noopener noreferrer">Explorer</a>
            <a className="footer-link" href="https://faucet.sui.io/" target="_blank" rel="noopener noreferrer">Sui Faucet</a>
          </div>
          <div className="footer-col">
            <span className="footer-col-title">Developers</span>
            <a className="footer-link" onClick={() => { setViewMode('docs'); setActiveDocId('intro'); window.scrollTo(0, 0); }}>API Reference</a>
            <a className="footer-link" onClick={() => { setViewMode('docs'); setActiveDocId('contract'); window.scrollTo(0, 0); }}>Move Source</a>
            <a className="footer-link" href="https://github.com/0xnald/sui-safesend" target="_blank" rel="noopener noreferrer">GitHub Repo</a>
          </div>
          <div className="footer-col">
            <span className="footer-col-title">Socials</span>
            <a className="footer-link" href="https://x.com/suisfsend/" target="_blank" rel="noopener noreferrer">X / Twitter</a>
            <a className="footer-link" href="https://discord.com" target="_blank" rel="noopener noreferrer">Discord</a>
            <a className="footer-link" href="https://telegram.org" target="_blank" rel="noopener noreferrer">Telegram</a>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <div className="footer-socials">
          <a href="https://github.com/0xnald/sui-safesend" target="_blank" rel="noopener noreferrer" className="footer-social-icon"><Coins size={18} /></a>
          <a href="https://x.com/suisfsend/" target="_blank" rel="noopener noreferrer" className="footer-social-icon"><Sparkles size={18} /></a>
          <a href="https://discord.com" target="_blank" rel="noopener noreferrer" className="footer-social-icon"><ShieldCheck size={18} /></a>
        </div>
        <div>
          <span>© 2026 Sui SafeSend Labs. Built for Sui Overflow.</span>
        </div>
      </div>
    </footer>
  );

  return (
    <div className="App" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      
      {/* Top Header Navigation */}
      <header className="app-header">
        {/* Logo and Name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => { setViewMode('app'); window.scrollTo(0, 0); }}>
          <LogoSVG size={40} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <h2 style={{ fontSize: '1.4rem', margin: 0, color: 'var(--text-white)', fontWeight: 800, letterSpacing: '-0.5px' }}>Sui SafeSend</h2>
            <span style={{ fontSize: '0.72rem', color: 'var(--blue-sky)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginTop: '-2px' }}>Escrow Protocol</span>
          </div>
        </div>

        {/* Header Right Content (varies based on login and view mode) */}
        {viewMode === 'docs' ? (
          <button 
            className="btn-venmo-secondary" 
            onClick={() => setViewMode('app')}
            style={{ padding: '8px 18px', fontSize: '0.85rem' }}
          >
            ← Back to App
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            {/* Network Selector Dropdown - Only visible when connected/logged in */}
            {activeAddress && (
              <select 
                value={network}
                onChange={(e) => selectNetwork(e.target.value)}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: 'var(--text-white)',
                  border: '1px solid var(--border-navy)',
                  padding: '8px 12px',
                  borderRadius: '9999px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  outline: 'none',
                  transition: 'all 0.2s'
                }}
              >
                <option value="mainnet" style={{ background: '#0b1329', color: '#fff' }}>Mainnet</option>
                <option value="testnet" style={{ background: '#0b1329', color: '#fff' }}>Testnet</option>
              </select>
            )}

            {!activeAddress ? (
              <button 
                className="btn-venmo-primary" 
                onClick={() => setShowEmailModal(true)}
                style={{ padding: '10px 20px', fontSize: '0.85rem' }}
              >
                <Wallet size={16} />
                Login / Connect
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative' }}>
                {/* Balance */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px', 
                  background: 'rgba(0, 112, 243, 0.08)', 
                  padding: '8px 14px', 
                  borderRadius: '9999px', 
                  border: '1px solid rgba(0, 112, 243, 0.2)', 
                  fontSize: '0.88rem', 
                  color: 'var(--text-white)', 
                  fontWeight: 700 
                }}>
                  <Coins size={14} color="var(--blue-sky)" />
                  <span>{activeBalance} SUI</span>
                </div>

                {/* User Dropdown Trigger */}
                <button 
                  onClick={() => setShowUserDropdown(!showUserDropdown)}
                  className="btn-venmo-secondary"
                  style={{ padding: '8px 18px', fontSize: '0.85rem' }}
                >
                  {connectedEmail ? <Mail size={14} /> : <Wallet size={14} />}
                  <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {connectedEmail ? connectedEmail : `${activeAddress.substring(0, 6)}...${activeAddress.substring(activeAddress.length - 4)}`}
                  </span>
                  <ChevronDown size={14} style={{ transform: showUserDropdown ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                </button>

                {/* User Dropdown Menu */}
                {showUserDropdown && (
                  <div className="navy-card" style={{ 
                    position: 'absolute', 
                    top: 'calc(100% + 8px)', 
                    right: 0, 
                    width: '290px', 
                    zIndex: 100, 
                    padding: '20px', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '15px' 
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-light)', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                        {connectedEmail ? "GOOGLE zkLOGIN SESSION" : "CONNECTED WALLET"}
                      </span>
                      {connectedEmail && (
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-white)', wordBreak: 'break-all', fontWeight: 600 }}>
                          {connectedEmail}
                        </span>
                      )}
                    </div>

                    <div style={{ borderTop: '1px solid var(--border-navy)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-light)', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Wallet Address:</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0,0,0,0.25)', padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border-navy)' }}>
                        <code style={{ fontSize: '0.72rem', color: 'var(--text-white)', wordBreak: 'break-all', flex: 1 }}>
                          {activeAddress}
                        </code>
                        <button 
                          onClick={handleCopyAddress} 
                          title="Copy Address"
                          style={{ background: 'rgba(255,255,255,0.05)', border: 'none', padding: '6px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          {copied ? <Check size={12} color="var(--green-success)" /> : <Copy size={12} color="var(--text-light)" />}
                        </button>
                      </div>
                    </div>

                    {network === 'testnet' && (
                      <div style={{ borderTop: '1px solid var(--border-navy)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-light)', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Need SUI Gas?</span>
                        <a 
                          href="https://faucet.sui.io/" 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          style={{ fontSize: '0.82rem', color: 'var(--blue-sky)', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          Claim Sui Faucet ↗
                        </a>
                      </div>
                    )}



                    <button 
                      onClick={handleDisconnect} 
                      className="btn-venmo-danger" 
                      style={{ width: '100%', padding: '10px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    >
                      <LogOut size={12} />
                      Disconnect Session
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </header>

      {/* Main Content switcher */}
      {viewMode === 'docs' ? (
        /* GitBook Developer Documentation Panel */
        <div className="gitbook-container">
          <div className="gitbook-sidebar">
            <div className="gitbook-sidebar-section">
              <span className="gitbook-sidebar-title">GETTING STARTED</span>
              <div 
                className={`gitbook-nav-item ${activeDocId === 'intro' ? 'active' : ''}`}
                onClick={() => setActiveDocId('intro')}
              >
                <BookOpen size={16} />
                Introduction
              </div>
            </div>
            
            <div className="gitbook-sidebar-section">
              <span className="gitbook-sidebar-title">TECHNICAL PROTOCOL</span>
              <div 
                className={`gitbook-nav-item ${activeDocId === 'contract' ? 'active' : ''}`}
                onClick={() => setActiveDocId('contract')}
              >
                <Lock size={16} />
                Move Smart Contract
              </div>
              <div 
                className={`gitbook-nav-item ${activeDocId === 'zklogin' ? 'active' : ''}`}
                onClick={() => setActiveDocId('zklogin')}
              >
                <ShieldCheck size={16} />
                zkLogin Cryptography
              </div>
              <div 
                className={`gitbook-nav-item ${activeDocId === 'keeper' ? 'active' : ''}`}
                onClick={() => setActiveDocId('keeper')}
              >
                <Clock size={16} />
                Keeper Automation
              </div>
            </div>

            <div className="gitbook-sidebar-section">
              <span className="gitbook-sidebar-title">API REFERENCE</span>
              <div 
                className={`gitbook-nav-item ${activeDocId === 'integration' ? 'active' : ''}`}
                onClick={() => setActiveDocId('integration')}
              >
                <Send size={16} />
                Integration Guide
              </div>
            </div>
          </div>

          <div className="gitbook-content dark-scrollbar">
            {activeDocId === 'intro' && (
              <>
                <h1 className="gitbook-title">Introduction</h1>
                <p className="gitbook-paragraph">
                  Sui SafeSend is a decentralized, secure peer-to-peer payments escrow protocol built on the Sui blockchain that introduces <strong>reversible transactions</strong> to eliminate address anxiety and prevent fat-finger mistakes.
                </p>
                <div className="gitbook-callout">
                  <Sparkles size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong>How it works:</strong> SafeSend deposits funds into an on-chain shared escrow contract. The recipient can claim the funds after a configurable safety window closes. During this safety window, the sender can recall and cancel the payment instantly if a mistake was made.
                  </div>
                </div>
                <h2 className="gitbook-subtitle">Key Features</h2>
                <ul style={{ paddingLeft: '20px', margin: 0, color: 'var(--text-muted)', lineHeight: '1.7', fontSize: '0.98rem' }}>
                  <li style={{ marginBottom: '8px' }}><strong>Reversible Safety Window</strong>: Recall payments instantly before they are finalized.</li>
                  <li style={{ marginBottom: '8px' }}><strong>zkLogin Integration</strong>: Send funds directly to email addresses. The recipient claims them via passwordless Google OAuth.</li>
                  <li style={{ marginBottom: '8px' }}><strong>Background Keeper Bot</strong>: Bots auto-release finalized payments, making execution seamless and gasless for the recipient.</li>
                  <li style={{ marginBottom: '8px' }}><strong>Gas Faucet Helper</strong>: Auto-funds new zkLogin addresses with gas SUI if they have pending escrows, ensuring zero onboarding friction.</li>
                </ul>

                <h2 className="gitbook-subtitle">On-Chain Deployment Details</h2>
                <div className="gitbook-callout gitbook-callout-success" style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'stretch', marginTop: '15px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShieldCheck size={20} style={{ flexShrink: 0 }} />
                    <strong>Sui Contract Deployment Status</strong>
                  </div>
                  <div style={{ fontSize: '0.88rem', display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                    <div><strong>Active Network:</strong> {network === 'mainnet' ? 'Sui Mainnet' : 'Sui Testnet'}</div>
                    <div><strong>Package ID:</strong> <code style={{ background: 'rgba(255,255,255,0.15)', padding: '2px 6px', borderRadius: '4px', wordBreak: 'break-all' }}>{CURRENT_PACKAGE_ID || "(Not Configured)"}</code></div>
                    <div><strong>Treasury Wallet:</strong> <code style={{ background: 'rgba(255,255,255,0.15)', padding: '2px 6px', borderRadius: '4px', wordBreak: 'break-all' }}>{CURRENT_TREASURY || "(Not Configured)"}</code></div>
                    <div><strong>Platform Fee:</strong> 0.1% on successful claims and automatic releases</div>
                  </div>
                </div>
              </>
            )}

            {activeDocId === 'contract' && (
              <>
                <h1 className="gitbook-title">Move Smart Contract</h1>
                <p className="gitbook-paragraph">
                  The SafeSend Move contract manages deposits, claims, releases, and cancellations on-chain. Below is the Move definition of the shared <code>SafePayment</code> object.
                </p>
                <div className="gitbook-code-container">
                  <div className="gitbook-code-header">
                    <span className="gitbook-code-lang">move</span>
                    <button className="gitbook-copy-btn" onClick={() => handleCopyDocCode('move-struct', MOVE_STRUCT_CODE)}>
                      {docCopied['move-struct'] ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                      {docCopied['move-struct'] ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <pre className="gitbook-code">{MOVE_STRUCT_CODE}</pre>
                </div>
                <div className="gitbook-callout gitbook-callout-warning">
                  <AlertCircle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong>Irreversibility:</strong> Once the <code>release_time</code> is reached, the sender can no longer call <code>cancel_payment</code>, making the transfer completely finalized and irreversible.
                  </div>
                </div>
              </>
            )}

            {activeDocId === 'zklogin' && (
              <>
                <h1 className="gitbook-title">zkLogin Cryptography</h1>
                <p className="gitbook-paragraph">
                  Sui zkLogin allows users to authenticate using Web2 identity providers like Google OIDC. SafeSend derives a secure deterministic 128-bit BigInt salt from the email address to calculate the user's Sui address:
                </p>
                <div className="gitbook-code-container">
                  <div className="gitbook-code-header">
                    <span className="gitbook-code-lang">typescript</span>
                    <button className="gitbook-copy-btn" onClick={() => handleCopyDocCode('zk-salt', ZKLOGIN_SALT_CODE)}>
                      {docCopied['zk-salt'] ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                      {docCopied['zk-salt'] ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <pre className="gitbook-code">{ZKLOGIN_SALT_CODE}</pre>
                </div>
                <div className="gitbook-callout">
                  <ShieldCheck size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong>Privacy Preserved:</strong> The salt is derived locally using client-side cryptographic hashing. The exact email is never exposed publicly in OIDC proofs, preserving user confidentiality.
                  </div>
                </div>
              </>
            )}

            {activeDocId === 'keeper' && (
              <>
                <h1 className="gitbook-title">Keeper Automation</h1>
                <p className="gitbook-paragraph">
                  To guarantee zero-effort settlements, SafeSend deploys background keeper bots. The bot queries the blockchain for events, checks which payments are eligible for settlement, and triggers releases automatically:
                </p>
                <div className="gitbook-code-container">
                  <div className="gitbook-code-header">
                    <span className="gitbook-code-lang">typescript</span>
                    <button className="gitbook-copy-btn" onClick={() => handleCopyDocCode('keeper-code', KEEPER_AUTOCLAIM_CODE)}>
                      {docCopied['keeper-code'] ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                      {docCopied['keeper-code'] ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <pre className="gitbook-code">{KEEPER_AUTOCLAIM_CODE}</pre>
                </div>
                <div className="gitbook-callout gitbook-callout-success">
                  <CheckCircle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong>Keeper Bot active:</strong> Running locally on port <code>3001</code>. It also provides a CORS-enabled gas faucet for new zkLogin users with pending escrows, helping them pay for transaction claims.
                  </div>
                </div>
              </>
            )}

            {activeDocId === 'integration' && (
              <>
                <h1 className="gitbook-title">Integration Guide</h1>
                <p className="gitbook-paragraph">
                  Developers can easily integrate SafeSend into their dApps using `@mysten/dapp-kit` or other typescript SDKs. Below is a complete transaction block structure for creating escrows:
                </p>
                <div className="gitbook-code-container">
                  <div className="gitbook-code-header">
                    <span className="gitbook-code-lang">typescript</span>
                    <button className="gitbook-copy-btn" onClick={() => handleCopyDocCode('integration-code', INTEGRATION_CODE)}>
                      {docCopied['integration-code'] ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                      {docCopied['integration-code'] ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <pre className="gitbook-code">{INTEGRATION_CODE}</pre>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        /* SafeSend App Dashboard / Landing View Mode */
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {!activeAddress ? (
            /* Logged Out: Premium Landing Page Layout */
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              
              {/* Hero Banner Section */}
              <section className="landing-hero">
                <div style={{ width: '70px', height: '70px', borderRadius: '50%', background: 'var(--blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
                  <Lock size={32} color="var(--blue-primary)" />
                </div>
                <h1 className="landing-title">
                  Fast, Safe &amp; Reversible Payments
                </h1>
                <p className="landing-subtitle">
                  Send SUI to any wallet address or email. Recall mistakes instantly before final settlement, or let our keeper auto-deliver upon expiry.
                </p>
                <button 
                  className="btn-venmo-primary"
                  onClick={() => setShowEmailModal(true)}
                  style={{ padding: '16px 36px', fontSize: '1.05rem', marginTop: '10px' }}
                >
                  <Wallet size={18} />
                  Access SafeSend Dashboard
                </button>
              </section>

              {/* Marketing Features Grid Section */}
              <section className="landing-feature-section">
                
                {/* Feature 1: Security */}
                <div className="landing-feature-row">
                  <div className="landing-feature-text">
                    <h2 className="landing-feature-headline">Security that's always-on</h2>
                    <p className="landing-feature-description">
                      Every transaction is securely held in an on-chain shared smart contract safety window. If you spot an error, reverse the transfer instantly and pull your SUI back to your wallet. Sleep peacefully knowing mistakes are reversible.
                    </p>
                  </div>
                  <div className="landing-feature-image-container">
                    <div className="landing-feature-image-wrapper">
                      <img 
                        src="/security_feature.png" 
                        alt="Security Always On" 
                        className="landing-feature-image"
                        style={{ maxHeight: '340px' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Feature 2: Digital Wallet */}
                <div className="landing-feature-row reverse">
                  <div className="landing-feature-text">
                    <h2 className="landing-feature-headline">Load your digital wallet</h2>
                    <p className="landing-feature-description">
                      Send funds directly to any Google email address. SafeSend deterministically derives their OIDC zkLogin address. The recipient simply signs in with Google to access their digital wallet and claim the funds directly, with gas fees funded automatically by our keeper bot.
                    </p>
                  </div>
                  <div className="landing-feature-image-container">
                    <div className="landing-feature-image-wrapper">
                      <img 
                        src="/digital_wallet_feature.png" 
                        alt="Load Digital Wallet" 
                        className="landing-feature-image"
                        style={{ maxHeight: '340px' }}
                      />
                    </div>
                  </div>
                </div>

              </section>

              {/* Uniswap-style Footer */}
              {renderFooter()}

            </div>
          ) : (
            /* Logged In: Clean Simple organized Dashboard Details UI */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
              
              {/* Organized status notifications */}
              {errorMessage && (
                <div className="venmo-card dashboard-notification" style={{ borderLeft: '5px solid var(--red-error)', background: 'var(--red-light)' }}>
                  <AlertCircle color="var(--red-error)" size={20} style={{ flexShrink: 0 }} />
                  <span style={{ color: 'var(--text-dark)', fontWeight: 600 }}>{errorMessage}</span>
                </div>
              )}

              {sendSuccess && (
                <div className="venmo-card dashboard-notification" style={{ borderLeft: '5px solid var(--green-success)', background: 'var(--green-light)' }}>
                  <CheckCircle color="var(--green-success)" size={20} style={{ flexShrink: 0 }} />
                  <span style={{ color: 'var(--text-dark)', fontWeight: 600 }}>{sendSuccess}</span>
                </div>
              )}

              {/* Minimalist Dashboard content */}
              <div className="venmo-card dashboard-card">
                

                
                {/* Dashboard Header Title */}
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                  <h1 className="dashboard-title">Reversible Crypto Payments</h1>
                  <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', margin: 0, maxWidth: '580px', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
                    Secure, reversible SUI escrow transfers. Send payments to standard addresses or Google emails with complete reversal safety windows.
                  </p>
                </div>

                {/* Dashboard Tab navigation */}
                <div className="dashboard-tabs">
                  <button 
                    onClick={() => setActiveTab('send')}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '0 12px 14px',
                      color: activeTab === 'send' ? 'var(--blue-primary)' : 'var(--text-muted)',
                      fontWeight: 800,
                      fontSize: '1rem',
                      cursor: 'pointer',
                      borderBottom: activeTab === 'send' ? '3px solid var(--blue-primary)' : '3px solid transparent',
                      marginBottom: '-2px',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <Send size={16} />
                    Send Escrow
                  </button>
                  <button 
                    onClick={() => setActiveTab('manage')}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '0 12px 14px',
                      color: activeTab === 'manage' ? 'var(--blue-primary)' : 'var(--text-muted)',
                      fontWeight: 800,
                      fontSize: '1rem',
                      cursor: 'pointer',
                      borderBottom: activeTab === 'manage' ? '3px solid var(--blue-primary)' : '3px solid transparent',
                      marginBottom: '-2px',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <Clock size={16} />
                    Active Escrows ({sentPayments.length + receivedPayments.length})
                  </button>
                  <button 
                    onClick={() => setActiveTab('history')}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '0 12px 14px',
                      color: activeTab === 'history' ? 'var(--blue-primary)' : 'var(--text-muted)',
                      fontWeight: 800,
                      fontSize: '1rem',
                      cursor: 'pointer',
                      borderBottom: activeTab === 'history' ? '3px solid var(--blue-primary)' : '3px solid transparent',
                      marginBottom: '-2px',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <History size={16} />
                    History Logs ({historyPayments.length})
                  </button>
                </div>

                {/* Dashboard Inner content panels */}
                {activeTab === 'send' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    
                    {/* Destination Switcher */}
                    <div style={{ display: 'flex', gap: '10px', background: 'var(--bg-card-light)', padding: '5px', borderRadius: '12px', width: 'fit-content', alignSelf: 'center' }}>
                      <button 
                        type="button"
                        onClick={() => setSendMode('wallet')}
                        style={{
                          background: sendMode === 'wallet' ? 'var(--bg-card-white)' : 'transparent',
                          color: sendMode === 'wallet' ? 'var(--blue-primary)' : 'var(--text-muted)',
                          border: 'none',
                          padding: '8px 18px',
                          borderRadius: '8px',
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          boxShadow: sendMode === 'wallet' ? '0 2px 5px rgba(0,0,0,0.06)' : 'none',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        Sui Address
                      </button>
                      <button 
                        type="button"
                        onClick={() => setSendMode('email')}
                        style={{
                          background: sendMode === 'email' ? 'var(--bg-card-white)' : 'transparent',
                          color: sendMode === 'email' ? 'var(--blue-primary)' : 'var(--text-muted)',
                          border: 'none',
                          padding: '8px 18px',
                          borderRadius: '8px',
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          boxShadow: sendMode === 'email' ? '0 2px 5px rgba(0,0,0,0.06)' : 'none',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        Google Email (zkLogin)
                      </button>
                    </div>

                    <form onSubmit={handleSendPayment} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      {sendMode === 'wallet' ? (
                        <div className="venmo-input-wrapper">
                          <label className="venmo-input-label">Recipient Sui Wallet Address</label>
                          <input 
                            type="text" 
                            className="venmo-input" 
                            placeholder="0x80445..." 
                            value={recipient}
                            onChange={(e) => setRecipient(e.target.value)}
                          />
                        </div>
                      ) : (
                        <div className="venmo-input-wrapper">
                          <label className="venmo-input-label">Recipient Email Address</label>
                          <input 
                            type="email" 
                            className="venmo-input" 
                            placeholder="recipient@example.com" 
                            value={recipientEmail}
                            onChange={(e) => setRecipientEmail(e.target.value)}
                          />
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.3 }}>
                            * We derive a zkLogin address. The recipient claims SUI by logging into their Gmail. Note: Email escrows must be claimed manually by the recipient.
                          </span>
                        </div>
                      )}

                      <div className="dashboard-grid-2-1">
                        <div className="venmo-input-wrapper">
                          <label className="venmo-input-label">Amount</label>
                          <input 
                            type="number" 
                            step="any"
                            className="venmo-input" 
                            placeholder="0.0" 
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                          />
                          {amount && parseFloat(amount) > 0 && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px', textAlign: 'left' }}>
                              <span>Recipient receives: </span>
                              <strong style={{ color: 'var(--green-success)' }}>
                                {(parseFloat(amount) * 0.999).toFixed(4)} SUI
                              </strong>
                              <span> (0.1% platform fee: {(parseFloat(amount) * 0.001).toFixed(4)} SUI)</span>
                            </div>
                          )}
                        </div>
                        <div className="venmo-input-wrapper">
                          <label className="venmo-input-label">Asset</label>
                          <select 
                            className="venmo-input venmo-select" 
                            value={coinType} 
                            onChange={(e) => setCoinType(e.target.value)}
                          >
                            <option value="SUI">SUI</option>
                          </select>
                        </div>
                      </div>

                      <div className="venmo-input-wrapper">
                        <label className="venmo-input-label">Safety Window (Reversal Duration)</label>
                        <select 
                          className="venmo-input venmo-select" 
                          value={lockDuration} 
                          onChange={(e) => setLockDuration(e.target.value)}
                        >
                          <option value="60">1 Minute (Testing / Demo)</option>
                          <option value="3600">1 Hour (Standard)</option>
                          <option value="43200">12 Hours (Safe)</option>
                          <option value="86400">24 Hours (Extreme Protection)</option>
                        </select>
                      </div>

                      {/* Note */}
                      <div className="venmo-input-wrapper">
                        <label className="venmo-input-label">What is it for? (Note)</label>
                        <input 
                          type="text" 
                          className="venmo-input" 
                          placeholder="pizza, coffee, services splits..." 
                          value={paymentNote}
                          onChange={(e) => setPaymentNote(e.target.value)}
                        />
                      </div>

                      <button 
                        type="submit" 
                        className="btn-venmo-primary" 
                        style={{ padding: '16px', fontSize: '1rem', marginTop: '8px' }} 
                        disabled={isSending}
                      >
                        {isSending ? "Creating Escrow Vault..." : "Send Reversible SUI"}
                      </button>
                    </form>

                    {/* Flow diagram visualizer */}
                    {animatingStep > 0 && (
                      <div style={{ marginTop: '20px', borderTop: '1.5px solid var(--border-light)', paddingTop: '20px' }}>
                        <h4 style={{ fontSize: '0.85rem', color: 'var(--text-dark)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px', textAlign: 'left' }}>On-Chain Transaction Flow</h4>
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 10px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                            <div className="pulse-node" style={{ width: '42px', height: '42px', borderRadius: '50%', background: animatingStep >= 1 ? 'var(--blue-primary)' : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.3s' }}>
                              <Coins size={16} color={animatingStep >= 1 ? '#fff' : 'var(--text-muted)'} />
                            </div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>Sender</span>
                          </div>

                          <div style={{ flex: 1, padding: '0 10px', height: '8px' }}>
                            <svg width="100%" height="8" viewBox="0 0 100 8" fill="none" preserveAspectRatio="none">
                              <path d="M0,4 H100" stroke={animatingStep >= 1 ? 'var(--blue-primary)' : 'var(--border-light)'} strokeWidth="2.5" className={animatingStep >= 1 ? 'flowing-line' : ''} />
                            </svg>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                            <div className={animatingStep >= 2 ? 'pulse-node' : ''} style={{ width: '42px', height: '42px', borderRadius: '50%', background: animatingStep >= 2 ? 'var(--blue-primary)' : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.3s' }}>
                              <Lock size={16} color={animatingStep >= 2 ? '#fff' : 'var(--text-muted)'} />
                            </div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>Escrow Vault</span>
                          </div>

                          <div style={{ flex: 1, padding: '0 10px', height: '8px' }}>
                            <svg width="100%" height="8" viewBox="0 0 100 8" fill="none" preserveAspectRatio="none">
                              <path d="M0,4 H100" stroke={animatingStep >= 3 ? 'var(--blue-primary)' : 'var(--border-light)'} strokeWidth="2.5" className={animatingStep >= 3 ? 'flowing-line' : ''} />
                            </svg>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: animatingStep >= 3 ? 'var(--blue-primary)' : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.3s' }}>
                              <Unlock size={16} color={animatingStep >= 3 ? '#fff' : 'var(--text-muted)'} />
                            </div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>Recipient</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'manage' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                    
                    {/* Incoming Escrows */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', textAlign: 'left' }}>
                      <h4 style={{ fontSize: '0.9rem', color: 'var(--text-dark)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px', margin: 0 }}>
                        Incoming Payments
                      </h4>
                      {isLoadingPayments ? (
                        <div style={{ padding: '20px', color: 'var(--text-muted)' }} className="shimmer">Loading incoming escrows...</div>
                      ) : receivedPayments.length === 0 ? (
                        <div style={{ padding: '30px 20px', color: 'var(--text-muted)', border: '1.5px dashed var(--border-light)', borderRadius: '16px', textAlign: 'center', fontSize: '0.9rem' }}>
                          No incoming escrows found.
                        </div>
                      ) : (
                        receivedPayments.map(p => {
                          const isExpired = p.releaseTime < Date.now();
                          const timeLeft = Math.max(0, Math.round((p.releaseTime - Date.now()) / 1000));
                          return (
                            <div key={p.id} className="escrow-card-item">
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--blue-primary)' }}>{p.amount} SUI</span>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>From: <code>{p.sender.substring(0, 8)}...{p.sender.substring(p.sender.length - 6)}</code></span>
                                {p.recipientEmail && <span style={{ fontSize: '0.8rem', color: 'var(--text-dark)', fontWeight: 600 }}>Sent to: {p.recipientEmail}</span>}
                                {!isExpired ? (
                                  <span className="venmo-badge venmo-badge-warning">
                                    <Clock size={12} />
                                    Reversible window: {Math.floor(timeLeft / 60)}m {timeLeft % 60}s left
                                  </span>
                                ) : (
                                  <span className="venmo-badge venmo-badge-success">
                                    <CheckCircle size={12} />
                                    Safety window closed. Click Claim.
                                  </span>
                                )}
                              </div>
                              <button 
                                className="btn-venmo-primary"
                                onClick={() => handleClaimPayment(p.id)}
                                disabled={!isExpired}
                                style={{ opacity: isExpired ? 1 : 0.5, padding: '10px 20px', fontSize: '0.85rem' }}
                              >
                                Claim Funds
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Sent Escrows */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', textAlign: 'left' }}>
                      <h4 style={{ fontSize: '0.9rem', color: 'var(--text-dark)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px', margin: 0 }}>
                        Sent Payments (In Escrow)
                      </h4>
                      {isLoadingPayments ? (
                        <div style={{ padding: '20px', color: 'var(--text-muted)' }} className="shimmer">Loading sent escrows...</div>
                      ) : sentPayments.length === 0 ? (
                        <div style={{ padding: '30px 20px', color: 'var(--text-muted)', border: '1.5px dashed var(--border-light)', borderRadius: '16px', textAlign: 'center', fontSize: '0.9rem' }}>
                          No sent payments currently locked.
                        </div>
                      ) : (
                        sentPayments.map(p => {
                          const canCancel = p.releaseTime > Date.now();
                          const timeLeft = Math.max(0, Math.round((p.releaseTime - Date.now()) / 1000));
                          return (
                            <div key={p.id} className="escrow-card-item">
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-dark)' }}>{p.amount} SUI</span>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>To: <code>{p.recipient.substring(0, 8)}...{p.recipient.substring(p.recipient.length - 6)}</code></span>
                                {p.recipientEmail && <span style={{ fontSize: '0.8rem', color: 'var(--blue-primary)', fontWeight: 600 }}>Email: {p.recipientEmail}</span>}
                                {canCancel ? (
                                  <span className="venmo-badge venmo-badge-warning">
                                    <Clock size={12} />
                                    Reversible: {Math.floor(timeLeft / 60)}m {timeLeft % 60}s left
                                  </span>
                                ) : (
                                  <span className="venmo-badge venmo-badge-success">
                                    <CheckCircle size={12} />
                                    Finalized (Auto-settles soon)
                                  </span>
                                )}
                              </div>
                              {canCancel && (
                                <button 
                                  className="btn-venmo-danger"
                                  onClick={() => handleCancelPayment(p.id)}
                                  style={{ padding: '10px 18px', fontSize: '0.82rem' }}
                                >
                                  <XCircle size={14} />
                                  Cancel &amp; Recall
                                </button>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>

                  </div>
                )}

                {activeTab === 'history' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', textAlign: 'left' }}>
                    <h3 style={{ fontSize: '1.25rem', color: 'var(--text-dark)', margin: 0, fontWeight: 800 }}>Completed Settlements</h3>
                    {isLoadingPayments ? (
                      <div style={{ padding: '20px', color: 'var(--text-muted)' }} className="shimmer">Loading history...</div>
                    ) : historyPayments.length === 0 ? (
                      <div style={{ padding: '30px 20px', color: 'var(--text-muted)', border: '1.5px dashed var(--border-light)', borderRadius: '16px', textAlign: 'center', fontSize: '0.9rem' }}>
                        No completed transfers found.
                      </div>
                    ) : (
                      historyPayments.map(p => {
                        const isSender = p.sender.toLowerCase() === activeAddress.toLowerCase();
                        return (
                          <div key={p.id} className={`escrow-card-item white-bg ${isSender ? 'sender-border' : 'recipient-border'}`}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <span style={{ fontWeight: 800, color: 'var(--text-dark)', fontSize: '1.05rem' }}>
                                {isSender ? "-" : "+"}{p.amount} SUI
                              </span>
                              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                {isSender ? `To: ${p.recipient.substring(0, 10)}...` : `From: ${p.sender.substring(0, 10)}...`}
                              </span>
                              {p.recipientEmail && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Email: {p.recipientEmail}</span>}
                            </div>
                            <div>
                              {p.isCancelled ? (
                                <span className="venmo-badge venmo-badge-error">Recalled</span>
                              ) : (
                                <span className="venmo-badge venmo-badge-success">Settled</span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              {/* Uniswap-style Footer */}
              {renderFooter()}

            </div>
          )}
        </main>
      )}

      {/* zkLogin Loading Overlay */}
      {zkLoginLoading && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(4, 8, 21, 0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div className="navy-card" style={{ maxWidth: '400px', width: '90%', padding: '40px 30px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '20px', border: '1px solid var(--blue-sky)' }}>
            <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid var(--blue-sky)', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Lock size={28} color="var(--blue-sky)" style={{ animation: 'spin 2s linear infinite' }} />
            </div>
            <h3 style={{ fontSize: '1.25rem', color: '#fff', margin: 0, fontWeight: 800 }}>zkLogin Verification</h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-light)', margin: 0, lineHeight: 1.5 }}>
              {zkLoginStatus}
            </p>
          </div>
        </div>
      )}

      {/* Unified Login Modal */}
      {showEmailModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(4, 8, 21, 0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="venmo-card login-modal-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-dark)', fontWeight: 800 }}>
                <Wallet size={22} color="var(--blue-primary)" />
                Access SafeSend
              </h3>
              <button 
                onClick={() => setShowEmailModal(false)} 
                style={{ background: 'none', border: 'none', color: 'var(--text-light)', fontSize: '1.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
              >
                ×
              </button>
            </div>
            
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4, textAlign: 'left' }}>
              Choose your preferred method to sign in. You can use your Google account for an instant passwordless session, or connect a browser extension wallet.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Option A: Google zkLogin */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--bg-card-light)', padding: '18px', borderRadius: '16px', border: '1.5px solid var(--border-light)', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                  <Mail size={16} color="var(--blue-primary)" />
                  <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-dark)' }}>Option 1: Google zkLogin</span>
                </div>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>
                  Create or access a secure wallet tied to your Gmail. No extensions or seed phrases required.
                </span>
                
                <button 
                  onClick={handleGoogleLogin} 
                  className="btn-venmo-primary" 
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', background: '#fff', color: '#0f172a', border: '1.5px solid var(--border-light)', fontWeight: 700, padding: '12px', cursor: 'pointer', borderRadius: '9999px', width: '100%', marginTop: '6px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                  </svg>
                  Sign in with Google
                </button>
              </div>

              {/* Option B: Browser Wallet */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--bg-card-light)', padding: '18px', borderRadius: '16px', border: '1.5px solid var(--border-light)', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                  <Wallet size={16} color="var(--blue-primary)" />
                  <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-dark)' }}>Option 2: Browser Wallet</span>
                </div>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>
                  Connect using standard browser extensions (Sui Wallet, Surf, etc.).
                </span>

                <div style={{ marginTop: '6px', width: '100%' }}>
                  <ConnectModal
                    trigger={
                      <button 
                        className="btn-venmo-primary" 
                        style={{ width: '100%', padding: '12px', borderRadius: '9999px', fontSize: '0.9rem', fontWeight: 700 }}
                      >
                        Connect Browser Wallet
                      </button>
                    }
                    open={showWalletModal}
                    onOpenChange={(open: boolean) => {
                      setShowWalletModal(open);
                      if (open) {
                        setShowEmailModal(false);
                      }
                    }}
                  />
                </div>
              </div>

            </div>
          </div>
        </div>
      )}


    </div>
  );
}

export default App;
