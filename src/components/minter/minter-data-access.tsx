'use client'

import { getMinterProgram, getMinterProgramId } from '@project/anchor'
import { useConnection } from '@solana/wallet-adapter-react'
import { Cluster, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo,useCallback } from 'react'
import { useCluster } from '../cluster/cluster-data-access'
import { useAnchorProvider } from '../solana/solana-provider'
import { useTransactionToast } from '../use-transaction-toast'
import { toast } from 'sonner'
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import * as anchor from '@coral-xyz/anchor';
import { ASSOCIATED_TOKEN_PROGRAM_ID } from '@coral-xyz/anchor/dist/cjs/utils/token';
import { useWallet } from '@solana/wallet-adapter-react'

export function useMinterProgram() {
  const { connection } = useConnection()
  const { publicKey } = useWallet(); // publicKey 是在这里定义的
  const { cluster } = useCluster()
  const transactionToast = useTransactionToast()
  const provider = useAnchorProvider()
  const programId = useMemo(() => getMinterProgramId(cluster.network as Cluster), [cluster])
  const program = useMemo(() => getMinterProgram(provider, programId), [provider, programId])

  const getProgramAccount = useQuery({
    queryKey: ['get-program-account', { cluster }],
    queryFn: () => connection.getParsedAccountInfo(programId),
  })

  const createToken = useMutation({
    mutationKey: ['minter', 'initialize', { cluster }],
    mutationFn: async (input: { decimals: number; initialAmount: number }) =>
      {
        // 生成一个新的 Keypair 用于 Mint 账户
        const mintKeypair = Keypair.generate();
        const user = provider.wallet.publicKey;
        // 从种子 "mint_authority" 派生 PDA
        const [pdaAuthority] = PublicKey.findProgramAddressSync([Buffer.from('mint_authority')], program.programId);
        const destinationTokenAccount = getAssociatedTokenAddressSync(mintKeypair.publicKey, user);
        const signature = await program.methods
        .createToken(input.decimals, new anchor.BN(input.initialAmount))
        .accounts({
          mint: mintKeypair.publicKey, pdaAuthority, destinationTokenAccount, user,
          systemProgram: SystemProgram.programId, tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([mintKeypair])
        .rpc();
      return { signature, mintAddress: mintKeypair.publicKey };
    },
    onSuccess: ({ signature, mintAddress }) => {
      transactionToast(signature);
      const mintAddressString = mintAddress.toBase58();
      console.log(mintAddressString)
      toast.success(<div><p>Token created successfully!</p><p>Mint Address: {mintAddressString}</p></div>);
    },
    onError: (error) => { toast.error(`Failed to create token: ${error.message}`); },
  });

   // 3. 添加新的 getTokenBalance 函数
   const getTokenBalance = async (mintAddress: string): Promise<string | null> => { // 明确返回类型
    if (!publicKey) {
      toast.error('Wallet not connected!');
      return null; // 修正：返回 null
    }
    if (!mintAddress) {
        toast.error('Please provide a mint address.');
        return null; // 修正：返回 null
    }

    try {
      const mint = new PublicKey(mintAddress);
      
      const ata = getAssociatedTokenAddressSync(mint, publicKey);
      
      const accountInfo = await connection.getParsedAccountInfo(ata);
      
      if (!accountInfo.value) {
        return '0';
      }

      const data = accountInfo.value.data as any;
      const balance = data.parsed.info.tokenAmount.uiAmountString;

      return balance;
    } catch (e) {
      console.error('Failed to get token balance:', e);
      toast.error('Failed to get token balance. Make sure the mint address is correct.');
      return null; // 修正：在 catch 中返回 null，不再 throw
    }
  };
   // 1. 新增函数：根据 Owner 地址获取其所有代币账户
   const getTokensByOwner = useCallback(async (ownerAddress: string) => {
    try {
      const owner = new PublicKey(ownerAddress);

      // 这是核心 RPC 调用
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(owner, {
        programId: TOKEN_PROGRAM_ID, // 我们只关心 SPL Token Program 创建的账户
      });

      // 2. 解析和格式化返回的数据
      const tokens = tokenAccounts.value.map(accountInfo => {
        const parsedInfo = accountInfo.account.data.parsed.info;
        return {
          mint: parsedInfo.mint as string, // Mint 地址
          ataAddress: accountInfo.pubkey.toBase58(), // Token Account 地址 (通常是 ATA)
          balance: parsedInfo.tokenAmount.uiAmountString as string,
          decimals: parsedInfo.tokenAmount.decimals as number,
        };
      });

      return tokens;
    } catch (e) {
      console.error('Failed to get tokens by owner:', e);
      let message = 'Failed to fetch tokens.';
      if (e instanceof Error) {
        if (e.message.includes('Invalid public key')) {
          message = 'The provided address is not a valid Solana address.';
        }
      }
      toast.error(message);
      return null;
    }
  }, [connection]); // 依赖于 connection

  return {
    program,
    programId,
    getProgramAccount,
    createToken,
    getTokenBalance,
    getTokensByOwner,
  }
}

