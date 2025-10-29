// import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http, createConfig } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import { injectedWallet, safeWallet, walletConnectWallet, baseAccount } from '@rainbow-me/rainbowkit/wallets'
import { farcasterMiniApp as miniAppConnector } from '@farcaster/miniapp-wagmi-connector'

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "demo";
const alchemyId = process.env.NEXT_PUBLIC_ALCHEMY_ID;

let connectors = connectorsForWallets(
  [
    {
      groupName: 'Recommended',
      wallets: [injectedWallet, safeWallet, walletConnectWallet, baseAccount],
    },
  ],
  {
    appName: 'PixPot',
    projectId: projectId,
  }
);

connectors.push(miniAppConnector());

const transports = {
  [base.id]: alchemyId
    ? http(`https://base-mainnet.g.alchemy.com/v2/${alchemyId}`)
    : http(),
  [baseSepolia.id]: alchemyId
    ? http(`https://base-sepolia.g.alchemy.com/v2/${alchemyId}`)
    : http(),
} as const;

const getConfig = () => {
  return createConfig({
    chains: [base, baseSepolia],
    connectors,
    ssr: true,
    transports,
  });
}

export const config = getConfig()

// export const config = getDefaultConfig({
//   appName: "PixPot",
//   projectId,
//   chains: [base, baseSepolia],
//   ssr: true,
//   transports,
// });

// export default config;
