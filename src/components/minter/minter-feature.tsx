'use client'

import { useWallet } from '@solana/wallet-adapter-react'
import { WalletButton } from '../solana/solana-provider'
import { ExplorerLink } from '../cluster/cluster-ui'
import { useMinterProgram } from './minter-data-access'
import { MinterFeature } from './minter-ui'
import { AppHero } from '../app-hero'
import { ellipsify } from '@/lib/utils'

export default function MinterPageFeature() {
  const { publicKey } = useWallet();
  const { programId } = useMinterProgram();

  return publicKey ? (
    <div>
      <AppHero
        title="Token Minter"
        subtitle="Create and mint your own SPL token on Solana. Specify the decimals and the initial amount to mint to your wallet."
      >
        <p className="mb-6">
          <ExplorerLink path={`account/${programId}`} label={ellipsify(programId.toString())} />
        </p>
      </AppHero>
      <MinterFeature />
    </div>
  ) : (
    <div className="max-w-4xl mx-auto">
      <div className="hero py-[64px]">
        <div className="hero-content text-center">
          <WalletButton />
        </div>
      </div>
    </div>
  );
}