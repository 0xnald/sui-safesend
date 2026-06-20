# Sui SafeSend — Reversible Escrow Crypto Payments

Sui SafeSend is a decentralized, secure peer-to-peer payments escrow protocol built on the Sui blockchain that introduces **reversible transactions** to eliminate address anxiety and prevent fat-finger mistakes. 

The platform allows users to send SUI directly to standard wallet addresses or Google email addresses. Transactions are temporarily locked in on-chain shared smart contract vaults. Senders can instantly reverse and recall their funds if they make a mistake, or let our automated keeper bot deliver them once the safety window expires.

---

## 🚀 Key Features

*   **Reversible Escrow Windows**: Custom safety windows (e.g., 1 minute for testing, 1 hour, or 12 hours) during which the sender can cancel and refund the transaction instantly.
*   **zkLogin Integration**: Send SUI directly to any Google email address. The recipient claims the funds simply by logging into Google using passwordless OAuth.
*   **Background Keeper Bot**: Automates the final settlement and release of expired escrows, ensuring zero onboarding friction for the recipient.
*   **Auto-Gas Faucet**: The keeper automatically funds new zkLogin addresses with gas SUI if they have pending escrows, allowing them to execute claims for free.
*   **0.1% Platform Fee**: Collects a micro-percentage (0.1%) of SUI on successfully settled payments on-chain, routing it directly to the platform's treasury.
*   **GitBook-Style Developer Docs**: A clean, technical documentation panel built directly into the web interface for developer onboarding.

---

## 📦 Deployment Status

SafeSend is deployed and live on the **Sui Testnet**:

*   **Active Network**: `Sui Testnet`
*   **Package ID**: `0x61d20bc284636d32f29c006a4d4795140aeda77f8c345f6376047dfddc032635`
*   **Module Name**: `safesend`
*   **Platform Treasury Address**: `0x804450ab336a932a58bc75dc7968b1903b685995a0e14c75babc3e4c7c84ff79`
*   **SuiVision Explorer**: [View Package on SuiVision](https://testnet.suivision.xyz/package/0x61d20bc284636d32f29c006a4d4795140aeda77f8c345f6376047dfddc032635)

---

## 📂 Repository Structure

```
├── safesend/                  # Move Smart Contracts
│   ├── sources/
│   │   └── safesend.move      # Core transaction logic & fee splits
│   ├── Move.toml              # Dependency configuration
│   └── Published.toml         # Publication metadata
│
├── frontend/                  # React + Vite Frontend & Keeper Bot
│   ├── api/
│   │   └── sui-prover.js      # Vercel Serverless Function (secure prover proxy)
│   ├── public/                # Static assets (favicons, illustrations)
│   ├── src/
│   │   ├── App.tsx            # Main application layout & states
│   │   ├── index.css          # CSS styling system & responsive designs
│   │   └── main.tsx
│   ├── keeper.js              # Node.js automated release keeper bot
│   ├── package.json
│   └── vite.config.ts         # Vite server proxy settings
```

---

## 🛠️ Getting Started

### Prerequisites
*   Node.js (v18+)
*   Sui CLI (v1.21.0+) to build/publish Move packages locally

### 1. Smart Contract Setup (Move)
To build and publish the Move smart contracts locally:
```bash
cd safesend
sui client switch --env testnet
sui client publish --gas-budget 100000000
```

### 2. Frontend Configuration
Navigate to the `frontend` directory:
```bash
cd frontend
npm install
```

Create a `.env` file in the `frontend` directory:
```env
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id
VITE_SHINAMI_API_KEY=your-shinami-api-key
```

### 3. Running the App Locally
Start the Vite development server:
```bash
npm run dev
```
The application will run locally on `http://localhost:5173`.

### 4. Running the Keeper Bot
To start the background keeper bot to auto-deliver pending testnet claims:
```bash
node keeper.js
```
The keeper bot runs on port `3001` and exposes a local faucet endpoint `/faucet` to distribute gas to new users.

---

## 🔒 Production Deployment (Vercel)

When deploying the frontend to Vercel, the relative prover path is automatically mapped to our Vercel Serverless Function (`frontend/api/sui-prover.js`).

1. Link your repository to **Vercel** and select `frontend` as the root directory.
2. In the Vercel dashboard, add the following **Environment Variables**:
   *   `VITE_GOOGLE_CLIENT_ID` = `your-google-oauth-client-id`
   *   `VITE_SHINAMI_API_KEY` = `your-shinami-api-key`
3. Click **Deploy**. Vercel will build the frontend assets and automatically host the `/api/sui-prover` serverless function.

---

## 🏆 Hackathon Credits
Built for the **Sui Overflow 2026 Hackathon**.
Designed and developed by [@0xnald](https://github.com/0xnald).
