'use client'

import { Keypair, PublicKey } from '@solana/web3.js'
import { useMemo } from 'react'
import { ExplorerLink } from '../cluster/cluster-ui'
import { useMinterProgram } from './minter-data-access'
import { ellipsify } from '@/lib/utils'
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card'
import { toast } from 'sonner';
import { useWallet } from '@solana/wallet-adapter-react'; // 导入 useWallet




export function MinterFeature() {
  const { getProgramAccount } = useMinterProgram();

  if (getProgramAccount.isLoading) {
    return <span className="loading loading-spinner loading-lg"></span>;
  }
  if (!getProgramAccount.data?.value) {
    return (
      <div className="alert alert-info flex justify-center">
        <span>
          Program account not found. Make sure you have deployed the program and are on the correct cluster.
        </span>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <MinterCreateForm />
      <TokenBalanceChecker />
      <OwnerTokenChecker />
    </div>
  );
}

// MinterCreateForm 组件代码（保持不变，为了完整性放在这里）
function MinterCreateForm() {
  const { createToken } = useMinterProgram();
  const [decimals, setDecimals] = useState(9);
  const [amount, setAmount] = useState(1000);

  const handleSubmit = () => {
    if (isNaN(decimals) || decimals < 0 || decimals > 9) {
      toast.error('Decimals must be a number between 0 and 9.');
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      toast.error('Amount must be a positive number.');
      return;
    }
    const initialAmount = amount * Math.pow(10, decimals);
    createToken.mutateAsync({ decimals, initialAmount });
  };

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Create a New Token</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="decimals">Token Decimals</Label>
          <Input id="decimals" type="number" value={decimals} onChange={(e) => setDecimals(parseInt(e.target.value, 10))} min="0" max="9" placeholder="e.g. 9" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="amount">Initial Mint Amount</Label>
          <Input id="amount" type="number" value={amount} onChange={(e) => setAmount(parseInt(e.target.value, 10))} min="1" placeholder="e.g. 1000" />
        </div>
        <Button onClick={handleSubmit} disabled={createToken.isPending} className="w-full">
          {createToken.isPending ? 'Creating...' : 'Create and Mint Token'}
        </Button>
      </CardContent>
    </Card>
  );
}

function TokenBalanceChecker() {
  const { getTokenBalance } = useMinterProgram();
  const [mintAddress, setMintAddress] = useState('');
  const [balance, setBalance] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleCheckBalance = async () => {
    setIsLoading(true);
    setBalance(null);
    
    // 我们不再需要 try/catch，因为错误在 getTokenBalance 内部处理了
    const newBalance = await getTokenBalance(mintAddress);

    // 检查返回结果
    if (newBalance !== null) {
      // 只有在成功获取到余额时才更新状态并显示成功 toast
      setBalance(newBalance);
      toast.success(`Balance: ${newBalance}`);
    }
    // 如果 newBalance 是 null，说明出错了，错误 toast 已经在内部显示

    setIsLoading(false);
  };

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Check Token Balance</CardTitle>
        <CardDescription>
          After creating a token, copy its Mint Address here to check your balance.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="mint-address">Token Mint Address</Label>
          <Input
            id="mint-address"
            type="text"
            value={mintAddress}
            onChange={(e) => setMintAddress(e.target.value)}
            placeholder="Enter Mint Address of the token"
          />
        </div>
        <Button onClick={handleCheckBalance} disabled={isLoading || !mintAddress} className="w-full">
          {isLoading ? 'Checking...' : 'Check Balance'}
        </Button>
        {balance !== null && (
          <div className="text-center p-2 bg-muted rounded-md mt-4">
            <p className="font-bold text-lg">Your Balance: {balance}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// 1. 创建新的组件来按 Owner 查询代币
interface TokenInfo {
  mint: string;
  ataAddress: string;
  balance: string;
  decimals: number;
}

function OwnerTokenChecker() {
  const { publicKey } = useWallet();
  const { getTokensByOwner } = useMinterProgram();
  const [ownerAddress, setOwnerAddress] = useState('');
  const [tokens, setTokens] = useState<TokenInfo[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 方便用户一键查询自己的钱包
  const handleCheckMyWallet = () => {
    if (publicKey) {
      setOwnerAddress(publicKey.toBase58());
    } else {
      toast.error('Please connect your wallet first.');
    }
  };

  const handleFetchTokens = async () => {
    if (!ownerAddress) return;
    setIsLoading(true);
    setTokens(null);
    
    const result = await getTokensByOwner(ownerAddress);
    if (result) {
      setTokens(result);
      if (result.length === 0) {
        toast.info('This address does not hold any tokens.');
      } else {
        toast.success(`Found ${result.length} token(s).`);
      }
    }
    
    setIsLoading(false);
  };
  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Check All Tokens in a Wallet</CardTitle>
        <CardDescription>Enter a Solana wallet address to see all SPL Tokens it holds.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            type="text"
            value={ownerAddress}
            onChange={(e) => setOwnerAddress(e.target.value)}
            placeholder="Enter a wallet address"
            className="flex-grow"
          />
          <Button variant="outline" onClick={handleCheckMyWallet}>Use My Wallet</Button>
        </div>
        <Button onClick={handleFetchTokens} disabled={isLoading || !ownerAddress} className="w-full">
          {isLoading ? 'Fetching...' : 'Fetch Tokens'}
        </Button>

        {tokens && (
          <div className="mt-4 space-y-2">
            <h3 className="font-semibold">{tokens.length > 0 ? 'Tokens Found:' : 'No Tokens Found'}</h3>
            <div className="max-h-60 overflow-y-auto rounded-md border p-2">
              {tokens.map((token) => (
                <div key={token.mint} className="p-2 border-b last:border-b-0 text-sm">
                  <p><strong>Balance:</strong> {token.balance}</p>
                  <div><strong>Mint:</strong> <ExplorerLink path={`address/${token.mint}`} label={ellipsify(token.mint)} /></div>
                  <div><strong>Token Account (ATA):</strong> <ExplorerLink path={`address/${token.ataAddress}`} label={ellipsify(token.ataAddress)} /></div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}