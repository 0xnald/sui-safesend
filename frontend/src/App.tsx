import React, { useState, useEffect } from 'react';
import { 
  useCurrentAccount, 
  useSignAndExecuteTransaction, 
  useSuiClient,
  useDisconnectWallet,
  ConnectModal
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
  Wallet
} from 'lucide-react';
import './App.css';

// Deployed Package Configuration on Sui Testnet
const PACKAGE_ID = "0xa6884491ed641fc9eb95c6a066cfc7ef7aa817fc6e17dff51de5b3ce7da6362f";
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

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "555776269604-demo-client-id.apps.googleusercontent.com";

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
        window.location.hash = '';
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

      const response = await fetch('/sui-prover/v1', {
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

  // Sync payments when user logins or switches tabs
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
  }, [activeAddress, connectedEmail]);

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
        query: { MoveEventType: `${PACKAGE_ID}::${MODULE_NAME}::PaymentCreated` },
        limit: 50,
        order: 'descending'
      });

      // B. Query all claimed/settled events
      const claimedEvents = await suiClient.queryEvents({
        query: { MoveEventType: `${PACKAGE_ID}::${MODULE_NAME}::PaymentClaimed` },
        limit: 50
      });
      const claimedIds = new Set(claimedEvents.data.map((e: any) => e.parsedJson.payment_id));

      // C. Query all cancelled events
      const cancelledEvents = await suiClient.queryEvents({
        query: { MoveEventType: `${PACKAGE_ID}::${MODULE_NAME}::PaymentCancelled` },
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
        target: `${PACKAGE_ID}::${MODULE_NAME}::create_payment`,
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
            chain: 'sui:testnet',
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
        target: `${PACKAGE_ID}::${MODULE_NAME}::claim_payment`,
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
          chain: 'sui:testnet'
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
        target: `${PACKAGE_ID}::${MODULE_NAME}::cancel_payment`,
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
          chain: 'sui:testnet'
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

  return (
    <div className="App" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 0', borderBottom: '1px solid var(--border)', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ShieldCheck size={36} color="var(--accent)" />
          <h2 style={{ fontSize: '1.5rem', margin: 0, background: 'linear-gradient(to right, #fff, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Sui SafeSend</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {!activeAddress ? (
            <button 
              className="btn-primary" 
              onClick={() => setShowEmailModal(true)}
              style={{ padding: '10px 20px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '12px' }}
            >
              <Wallet size={16} />
              Login / Connect Wallet
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative' }}>
              {/* Balance display */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(168, 85, 247, 0.06)', padding: '8px 14px', borderRadius: '12px', border: '1px solid rgba(168, 85, 247, 0.15)', fontSize: '0.9rem', color: 'var(--text-h)', fontWeight: 600 }}>
                <Coins size={16} color="var(--accent)" />
                <span>{activeBalance} SUI</span>
              </div>

              {/* User Dropdown Trigger */}
              <button 
                onClick={() => setShowUserDropdown(!showUserDropdown)}
                className="btn-secondary"
                style={{ padding: '8px 16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}
              >
                {connectedEmail ? <Mail size={14} color="var(--accent)" /> : <Wallet size={14} color="var(--accent)" />}
                <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {connectedEmail ? connectedEmail : `${activeAddress.substring(0, 6)}...${activeAddress.substring(activeAddress.length - 4)}`}
                </span>
                <ChevronDown size={14} style={{ transform: showUserDropdown ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
              </button>

              {/* Dropdown Content */}
              {showUserDropdown && (
                <div className="glass-card" style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: '300px', zIndex: 100, padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)', border: '1px solid var(--border-glow)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-light)', fontWeight: 600 }}>
                      {connectedEmail ? "GOOGLE zkLOGIN SESSION" : "CONNECTED BROWSER WALLET"}
                    </span>
                    {connectedEmail && (
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-h)', wordBreak: 'break-all', fontWeight: 500 }}>
                        {connectedEmail}
                      </span>
                    )}
                  </div>

                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-light)', fontWeight: 600 }}>SUI WALLET ADDRESS:</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0,0,0,0.2)', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <code style={{ fontSize: '0.75rem', color: 'var(--text-h)', wordBreak: 'break-all', flex: 1 }}>
                        {activeAddress}
                      </code>
                      <button 
                        onClick={handleCopyAddress} 
                        title="Copy Address"
                        style={{ background: 'rgba(255,255,255,0.05)', border: 'none', padding: '6px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} color="var(--text)" />}
                      </button>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>Balance:</span>
                    <span style={{ fontSize: '1rem', color: 'var(--text-h)', fontWeight: 700 }}>{activeBalance} SUI</span>
                  </div>



                  <button 
                    onClick={handleDisconnect} 
                    className="btn-secondary" 
                    style={{ width: '100%', padding: '10px', borderColor: '#ef4444', color: '#fca5a5', background: 'rgba(239, 68, 68, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.85rem' }}
                  >
                    <LogOut size={14} />
                    Disconnect Session
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Hero Banner */}
      <section style={{ padding: '50px 0 30px', textAlign: 'center' }}>
        <h1 style={{ marginBottom: '16px', fontSize: '2.5rem', background: 'linear-gradient(to right, #fff, #d8b4fe)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Reversible Crypto Payments</h1>
        <p style={{ fontSize: '1.15rem', color: 'var(--text)', maxWidth: '650px', margin: '0 auto 25px', lineHeight: 1.5 }}>
          Eliminate address anxiety. Send SUI securely to any wallet address or email. Recall mistakes instantly before final settlement, or let our keeper auto-deliver upon expiry.
        </p>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', margin: '20px 0' }}>
          <button 
            className={`btn-secondary ${activeTab === 'send' ? 'active-tab' : ''}`}
            onClick={() => setActiveTab('send')}
            style={{ 
              borderColor: activeTab === 'send' ? 'var(--accent)' : 'var(--border)',
              background: activeTab === 'send' ? 'rgba(168, 85, 247, 0.08)' : 'rgba(255,255,255,0.02)' 
            }}
          >
            <Send size={16} />
            Send Escrow
          </button>
          <button 
            className={`btn-secondary ${activeTab === 'manage' ? 'active-tab' : ''}`}
            onClick={() => setActiveTab('manage')}
            style={{ 
              borderColor: activeTab === 'manage' ? 'var(--accent)' : 'var(--border)',
              background: activeTab === 'manage' ? 'rgba(168, 85, 247, 0.08)' : 'rgba(255,255,255,0.02)' 
            }}
          >
            <Clock size={16} />
            Active Escrows ({sentPayments.length + receivedPayments.length})
          </button>
          <button 
            className={`btn-secondary ${activeTab === 'history' ? 'active-tab' : ''}`}
            onClick={() => setActiveTab('history')}
            style={{ 
              borderColor: activeTab === 'history' ? 'var(--accent)' : 'var(--border)',
              background: activeTab === 'history' ? 'rgba(168, 85, 247, 0.08)' : 'rgba(255,255,255,0.02)' 
            }}
          >
            <History size={16} />
            History ({historyPayments.length})
          </button>
        </div>
      </section>

      {/* Main Content Area */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '30px', paddingBottom: '60px' }}>
        {errorMessage && (
          <div className="glass-card" style={{ borderLeft: '4px solid #ef4444', background: 'rgba(239, 68, 68, 0.05)', padding: '15px 20px', display: 'flex', alignItems: 'center', gap: '12px', maxWidth: '680px', margin: '0 auto', width: '100%' }}>
            <AlertCircle color="#ef4444" size={20} />
            <span style={{ color: 'var(--text-h)' }}>{errorMessage}</span>
          </div>
        )}

        {sendSuccess && (
          <div className="glass-card" style={{ borderLeft: '4px solid #10b981', background: 'rgba(16, 185, 129, 0.05)', padding: '15px 20px', display: 'flex', alignItems: 'center', gap: '12px', maxWidth: '680px', margin: '0 auto', width: '100%' }}>
            <CheckCircle color="#10b981" size={20} />
            <span style={{ color: 'var(--text-h)' }}>{sendSuccess}</span>
          </div>
        )}

        {!activeAddress && (
          <div className="glass-card" style={{ maxWidth: '480px', margin: '40px auto', padding: '40px 30px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Lock size={48} color="var(--accent)" style={{ margin: '0 auto 10px' }} />
            <h3 style={{ fontSize: '1.25rem', color: 'var(--text-h)' }}>Access SafeSend Platform</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text)', lineHeight: 1.5 }}>
              Log in to the platform to start sending and recalling payments securely.
            </p>
            <button 
              onClick={() => setShowEmailModal(true)} 
              className="btn-primary" 
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '10px', padding: '14px', borderRadius: '12px' }}
            >
              <Wallet size={18} />
              Log in / Connect Session
            </button>
          </div>
        )}

        {activeAddress && (
          <>
            {/* Tab 1: Send Payment */}
            {activeTab === 'send' && (
              <div className="glass-card" style={{ maxWidth: '680px', margin: '0 auto', width: '100%' }}>
                <h3 style={{ fontSize: '1.3rem', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                  <Send size={18} color="var(--accent)" />
                  Initiate Reversible Transfer
                </h3>

                {/* Send Mode Selection */}
                <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.9rem' }}>
                    <input 
                      type="radio" 
                      name="sendMode" 
                      checked={sendMode === 'wallet'} 
                      onChange={() => setSendMode('wallet')}
                      style={{ accentColor: 'var(--accent)' }}
                    />
                    Send to Sui Wallet Address
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.9rem' }}>
                    <input 
                      type="radio" 
                      name="sendMode" 
                      checked={sendMode === 'email'} 
                      onChange={() => setSendMode('email')}
                      style={{ accentColor: 'var(--accent)' }}
                    />
                    Send to Email Address (zkLogin)
                  </label>
                </div>
                
                <form onSubmit={handleSendPayment} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {sendMode === 'wallet' ? (
                    <div>
                      <label style={{ display: 'block', textAlign: 'left', marginBottom: '8px', fontWeight: 600, fontSize: '0.85rem' }}>Recipient Sui Wallet Address</label>
                      <input 
                        type="text" 
                        className="input-field" 
                        placeholder="0x80445..." 
                        value={recipient}
                        onChange={(e) => setRecipient(e.target.value)}
                      />
                    </div>
                  ) : (
                    <div>
                      <label style={{ display: 'block', textAlign: 'left', marginBottom: '8px', fontWeight: 600, fontSize: '0.85rem' }}>Recipient Email Address</label>
                      <input 
                        type="email" 
                        className="input-field" 
                        placeholder="recipient@example.com" 
                        value={recipientEmail}
                        onChange={(e) => setRecipientEmail(e.target.value)}
                      />
                      <span style={{ display: 'block', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-light)', marginTop: '6px' }}>
                        * We will securely derive a zkLogin address. The recipient can claim the funds simply by logging into this email via Google. Note: Email escrows must be claimed manually by the recipient.
                      </span>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '15px' }}>
                    <div>
                      <label style={{ display: 'block', textAlign: 'left', marginBottom: '8px', fontWeight: 600, fontSize: '0.85rem' }}>Amount</label>
                      <input 
                        type="number" 
                        step="any"
                        className="input-field" 
                        placeholder="0.0" 
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', textAlign: 'left', marginBottom: '8px', fontWeight: 600, fontSize: '0.85rem' }}>Asset</label>
                      <select 
                        className="input-field" 
                        value={coinType} 
                        onChange={(e) => setCoinType(e.target.value)}
                        style={{ appearance: 'none', background: 'rgba(0,0,0,0.2)' }}
                      >
                        <option value="SUI">SUI</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', textAlign: 'left', marginBottom: '8px', fontWeight: 600, fontSize: '0.85rem' }}>Safety Window (Reversal Duration)</label>
                    <select 
                      className="input-field" 
                      value={lockDuration} 
                      onChange={(e) => setLockDuration(e.target.value)}
                      style={{ appearance: 'none' }}
                    >
                      <option value="60">1 Minute (Testing / Demo)</option>
                      <option value="3600">1 Hour (Standard)</option>
                      <option value="43200">12 Hours (Safe)</option>
                      <option value="86400">24 Hours (Extreme Protection)</option>
                    </select>
                  </div>

                  <button type="submit" className="btn-primary" disabled={isSending}>
                    {isSending ? "Creating Escrow Contract..." : "Send Reversible Payment"}
                  </button>
                </form>

                {/* Live Flow Visualizer */}
                {animatingStep > 0 && (
                  <div style={{ marginTop: '40px', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
                    <h4 style={{ fontSize: '0.9rem', color: 'var(--text-h)', marginBottom: '15px' }}>On-Chain Transaction Flow</h4>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px' }}>
                      {/* Payer Node */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <div className={`pulse-node`} style={{ width: '45px', height: '45px', borderRadius: '50%', background: animatingStep >= 1 ? 'var(--accent)' : '#1f2028', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Coins size={18} color={animatingStep >= 1 ? '#fff' : 'var(--text)'} />
                        </div>
                        <span style={{ fontSize: '0.7rem' }}>Sender</span>
                      </div>

                      {/* Flow Arrow 1 */}
                      <div style={{ flex: 1, padding: '0 10px', height: '10px' }}>
                        <svg width="100%" height="8" viewBox="0 0 100 8" fill="none" preserveAspectRatio="none">
                          <path d="M0,4 H100" stroke={animatingStep >= 1 ? 'var(--accent)' : 'var(--border)'} strokeWidth="2" className={animatingStep >= 1 ? 'flowing-line' : ''} />
                        </svg>
                      </div>

                      {/* SafeSend Vault */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <div className={animatingStep >= 2 ? 'pulse-node' : ''} style={{ width: '45px', height: '45px', borderRadius: '50%', background: animatingStep >= 2 ? 'var(--accent)' : '#1f2028', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Lock size={18} color={animatingStep >= 2 ? '#fff' : 'var(--text)'} />
                        </div>
                        <span style={{ fontSize: '0.7rem' }}>Escrow Vault</span>
                      </div>

                      {/* Flow Arrow 2 */}
                      <div style={{ flex: 1, padding: '0 10px', height: '10px' }}>
                        <svg width="100%" height="8" viewBox="0 0 100 8" fill="none" preserveAspectRatio="none">
                          <path d="M0,4 H100" stroke={animatingStep >= 3 ? 'var(--accent)' : 'var(--border)'} strokeWidth="2" className={animatingStep >= 3 ? 'flowing-line' : ''} />
                        </svg>
                      </div>

                      {/* Recipient Node */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '45px', height: '45px', borderRadius: '50%', background: animatingStep >= 3 ? 'var(--accent)' : '#1f2028', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Unlock size={18} color={animatingStep >= 3 ? '#fff' : 'var(--text)'} />
                        </div>
                        <span style={{ fontSize: '0.7rem' }}>Recipient</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Manage Active Escrows */}
            {activeTab === 'manage' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                
                {/* Incoming Payments */}
                <div className="glass-card">
                  <h3 style={{ fontSize: '1.25rem', marginBottom: '20px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                    <Unlock size={18} color="var(--accent)" />
                    Incoming Escrow Payments
                  </h3>
                  
                  {isLoadingPayments ? (
                    <div style={{ padding: '30px', color: 'var(--text-light)' }} className="shimmer">Loading incoming escrows...</div>
                  ) : receivedPayments.length === 0 ? (
                    <div style={{ padding: '40px', color: 'var(--text-light)', border: '1px dashed var(--border)', borderRadius: '12px' }}>
                      No incoming escrows found for your account.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                      {receivedPayments.map(p => {
                        const isExpired = p.releaseTime < Date.now();
                        const timeLeft = Math.max(0, Math.round((p.releaseTime - Date.now()) / 1000));
                        return (
                          <div key={p.id} className="glass-card" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.01)' }}>
                            <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <span style={{ fontWeight: 600, color: 'var(--text-h)', fontSize: '1.1rem' }}>
                                {p.amount} {p.coinType}
                              </span>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>
                                From: <code style={{ fontSize: '0.75rem' }}>{p.sender}</code>
                              </span>
                              {p.recipientEmail && (
                                <span style={{ fontSize: '0.8rem', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <Mail size={12} />
                                  Sent to email: {p.recipientEmail}
                                </span>
                              )}
                              {!isExpired ? (
                                <span style={{ fontSize: '0.8rem', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <Clock size={12} />
                                  Reversible window active: {Math.floor(timeLeft / 60)}m {timeLeft % 60}s left
                                </span>
                              ) : (
                                <span style={{ fontSize: '0.8rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <Sparkles size={12} />
                                  Safety window closed. Auto-settling shortly or click Claim.
                                </span>
                              )}
                            </div>
                            
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                              <span className={`badge ${isExpired ? 'badge-success' : 'badge-warning'}`}>
                                {isExpired ? "Finalized" : "Reversible"}
                              </span>
                              <button 
                                className="btn-primary"
                                onClick={() => handleClaimPayment(p.id)}
                                disabled={!isExpired}
                                style={{ opacity: isExpired ? 1 : 0.5, cursor: isExpired ? 'pointer' : 'not-allowed' }}
                              >
                                Claim Funds
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Sent Payments (In Transit) */}
                <div className="glass-card">
                  <h3 style={{ fontSize: '1.25rem', marginBottom: '20px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                    <Lock size={18} color="var(--accent)" />
                    Sent Payments (In Escrow)
                  </h3>
                  
                  {isLoadingPayments ? (
                    <div style={{ padding: '30px', color: 'var(--text-light)' }} className="shimmer">Loading sent escrows...</div>
                  ) : sentPayments.length === 0 ? (
                    <div style={{ padding: '40px', color: 'var(--text-light)', border: '1px dashed var(--border)', borderRadius: '12px' }}>
                      You have no sent payments currently in escrow.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                      {sentPayments.map(p => {
                        const canCancel = p.releaseTime > Date.now();
                        const timeLeft = Math.max(0, Math.round((p.releaseTime - Date.now()) / 1000));
                        
                        return (
                          <div key={p.id} className="glass-card" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.01)' }}>
                            <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <span style={{ fontWeight: 600, color: 'var(--text-h)', fontSize: '1.1rem' }}>
                                {p.amount} {p.coinType}
                              </span>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>
                                To: <code style={{ fontSize: '0.75rem' }}>{p.recipient}</code>
                              </span>
                              {p.recipientEmail && (
                                <span style={{ fontSize: '0.8rem', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <Mail size={12} />
                                  Sent to email: {p.recipientEmail}
                                </span>
                              )}
                              {canCancel ? (
                                <span style={{ fontSize: '0.8rem', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <Clock size={12} />
                                  Reversal window active: {Math.floor(timeLeft / 60)}m {timeLeft % 60}s left
                                </span>
                              ) : (
                                <span style={{ fontSize: '0.8rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <Sparkles size={12} />
                                  Finalized. Settling to recipient...
                                </span>
                              )}
                            </div>
                            
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                              <span className={`badge ${canCancel ? 'badge-warning' : 'badge-success'}`}>
                                {canCancel ? "Reversible" : "Finalized"}
                              </span>
                              {canCancel && (
                                <button 
                                  className="btn-secondary"
                                  onClick={() => handleCancelPayment(p.id)}
                                  style={{ borderColor: '#ef4444', color: '#fca5a5', background: 'rgba(239, 68, 68, 0.05)' }}
                                >
                                  <XCircle size={14} />
                                  Cancel & Refund
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* Tab 3: Transaction History */}
            {activeTab === 'history' && (
              <div className="glass-card">
                <h3 style={{ fontSize: '1.25rem', marginBottom: '20px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                  <History size={18} color="var(--accent)" />
                  Completed Settlements
                </h3>

                {isLoadingPayments ? (
                  <div style={{ padding: '30px', color: 'var(--text-light)' }} className="shimmer">Loading history logs...</div>
                ) : historyPayments.length === 0 ? (
                  <div style={{ padding: '40px', color: 'var(--text-light)', border: '1px dashed var(--border)', borderRadius: '12px' }}>
                    No completed transactions found for this account session.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    {historyPayments.map(p => {
                      const isSender = p.sender.toLowerCase() === activeAddress.toLowerCase();
                      
                      return (
                        <div key={p.id} className="glass-card" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: isSender ? '4px solid #a855f7' : '4px solid #10b981' }}>
                          <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-h)' }}>
                              {isSender ? "-" : "+"}{p.amount} {p.coinType}
                            </span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>
                              {isSender ? `To: ${p.recipient}` : `From: ${p.sender}`}
                            </span>
                            {p.recipientEmail && (
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                                Email target: {p.recipientEmail}
                              </span>
                            )}
                          </div>
                          
                          <div>
                            {p.isCancelled ? (
                              <span className="badge badge-warning" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5' }}>
                                Recalled & Refunded
                              </span>
                            ) : (
                              <span className="badge badge-success" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#a7f3d0' }}>
                                Settled
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* zkLogin Loading Overlay */}
      {zkLoginLoading && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div className="glass-card" style={{ maxWidth: '400px', width: '90%', padding: '40px 30px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '20px', border: '1px solid var(--accent)' }}>
            <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(168, 85, 247, 0.1)', border: '1px solid var(--accent)', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Lock size={28} color="var(--accent)" className="flowing-line" style={{ animation: 'spin 2s linear infinite' }} />
            </div>
            <h3 style={{ fontSize: '1.2rem', color: 'var(--text-h)', margin: 0 }}>Sui zkLogin Authentication</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text)', margin: 0, lineHeight: 1.5 }}>
              {zkLoginStatus}
            </p>
          </div>
        </div>
      )}

      {/* Unified Login / Connect Modal */}
      {showEmailModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-card" style={{ maxWidth: '460px', width: '90%', padding: '30px 25px', display: 'flex', flexDirection: 'column', gap: '20px', border: '1px solid var(--accent)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Wallet size={20} color="var(--accent)" />
                Access SafeSend
              </h3>
              <button onClick={() => setShowEmailModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-light)', fontSize: '1.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>×</button>
            </div>
            
            <p style={{ fontSize: '0.85rem', color: 'var(--text)', margin: 0, lineHeight: 1.4 }}>
              Choose your preferred method to sign in. You can use your Google account for an instant passwordless session, or connect a browser wallet.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '10px' }}>
              
              {/* Option A: Google zkLogin */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <Mail size={16} color="var(--accent)" />
                  <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-h)' }}>Option 1: Google zkLogin</span>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-light)', lineHeight: 1.3 }}>
                  Create or access a secure wallet tied to your Google email. No extension required.
                </span>
                
                <button 
                  onClick={handleGoogleLogin} 
                  className="btn-secondary" 
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#fff', color: '#000', fontWeight: 600, padding: '10px', border: 'none', cursor: 'pointer', borderRadius: '8px', width: '100%', marginTop: '6px' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                  </svg>
                  Sign in with Google
                </button>
              </div>

              {/* Option B: Browser Wallet */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <Wallet size={16} color="var(--accent)" />
                  <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-h)' }}>Option 2: Browser Wallet</span>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-light)', lineHeight: 1.3 }}>
                  Connect using standard browser extensions like Sui Wallet or Surf.
                </span>

                <div style={{ marginTop: '6px', width: '100%' }}>
                  <ConnectModal
                    trigger={
                      <button 
                        className="btn-primary" 
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600 }}
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

      {/* Footer */}
      <footer style={{ marginTop: 'auto', padding: '20px 0', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', color: 'var(--text-light)', fontSize: '0.85rem' }}>
        <span>Sui SafeSend © 2026. Built for the Sui Overflow Hackathon.</span>
        <span>Secure, Reversible Payments powered by zkLogin.</span>
      </footer>
    </div>
  );
}

export default App;
