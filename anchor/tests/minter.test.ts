import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Minter } from "../target/types/minter";
import {
  getAssociatedTokenAddress,
  getMint,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey, Keypair } from "@solana/web3.js";

// 使用 Jest 的 describe/it/expect 风格来组织测试套件
describe("SPL Token Minter", () => {
  // --- 1. 设置测试环境 ---

  // 从环境中获取 Anchor Provider，它包含了与 Solana 网络的连接和钱包信息
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  // 从工作区加载编译好的程序，并指定其类型
  const program = anchor.workspace.minter as Program<Minter>;
  // 获取将要发起交易并接收代币的用户（即测试钱包）
  const user = provider.wallet as anchor.Wallet;

  // --- 2. 定义测试用例 ---

  // 我们将所有验证逻辑放在一个 "it" 块中，因为它代表了一个完整的用户场景。
  // 这个测试用例将验证 'create_token' 指令的端到端功能。
  it("能够成功创建、初始化并铸造一个新的SPL Token", async () => {
    // --- 准备阶段 (Arrange) ---
    // 定义新代币的参数
    const decimals = 9; // 例如，创建一个类似 SOL 的9位小数的代币
    const initialMintAmount = new anchor.BN(1_000_000 * 10 ** decimals); // 初始铸造 1,000,000 个代币

    // 为新的 Mint 账户生成一个唯一的密钥对。
    // 在测试中，我们每次都生成新的，以确保测试环境的纯净和独立性。
    const mintKeypair = Keypair.generate();//它代表的是你创建的 新代币（SPL Token）的 Mint 账户地址。

    // --- 推导阶段 (Derive) ---
    // 计算所有程序需要的派生地址 (PDA & ATA)

    // (A) 推导程序的 PDA (Program Derived Address)，它将作为唯一的铸币授权方。
    // 种子的选择（这里是 "mint_authority"）必须与合约 `lib.rs` 中 `#[account(seeds = ...)]` 的定义完全一致。
    const [pdaAuthority, _pdaBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("mint_authority")],
      program.programId
    );//PDA 是通过数学公式计算出来的，不依赖账户是否存在或项目是否部署。

    // (B) 推导用户的关联Token账户(ATA)地址。
    // 这是用户存储新创建代币的标准地址，也是最佳实践。
    const destinationAta = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      user.publicKey
    );

    // 打印出所有关键地址，便于调试
    console.log("--- 测试参数 ---");
    console.log(`Program ID: ${program.programId.toBase58()}`);
    console.log(`用户钱包 (Payer & Recipient): ${user.publicKey.toBase58()}`);
    console.log(`新 Mint 地址 (Keypair): ${mintKeypair.publicKey.toBase58()}`);
    console.log(`PDA 铸币授权方: ${pdaAuthority.toBase58()}`);
    console.log(`目标 ATA 地址: ${destinationAta.toBase58()}`);
    console.log("------------------");

    // --- 执行阶段 (Act) ---
    // 调用合约的 `create_token` 指令。
    // .rpc() 方法会构建、签名、发送交易，并等待网络以 "confirmed" 级别确认交易。
    // 该方法返回的 Promise 在交易确认后才会 resolve，并返回交易签名。
    const txSignature = await program.methods
      .createToken(decimals, initialMintAmount)
      .accounts({
        mint: mintKeypair.publicKey,
        pdaAuthority: pdaAuthority,
        destinationTokenAccount: destinationAta,
        user: user.publicKey,
        // 其他的 program 地址 (systemProgram, tokenProgram, associatedTokenProgram)
        // Anchor 会根据合约的上下文自动为我们填充。
      })
      .signers([mintKeypair]) // 因为我们使用 `init` 约束来创建 `mint` 账户，所以这个账户的密钥对需要对创建行为进行签名。
      .rpc();

    console.log("\n✅ 交易已发送并确认! 签名:", txSignature);

    // --- 验证阶段 (Assert) ---
    // 从链上获取最新的账户状态数据，并用 `expect` 进行断言，以验证交易结果是否符合预期。
    console.log("\n--- 开始验证链上状态 ---");

    // (A) 验证 Mint 账户的状态
    console.log("🔍 正在验证 Mint 账户...");
    
    // 使用 getMint 获取解析后的 Mint 数据（如 supply, decimals, authorities）
    const mintInfo = await getMint(provider.connection, mintKeypair.publicKey);
    
    // 要获取账户的元数据（如 owner program），必须使用 getAccountInfo。
    // getMint() 返回的对象不包含 owner 字段。
    const mintAccountInfo = await provider.connection.getAccountInfo(
      mintKeypair.publicKey
    );

    // 断言1: Mint 账户的铸币授权方 (mintAuthority) 应该是我们的 PDA。
    expect(mintInfo.mintAuthority.toBase58()).toEqual(pdaAuthority.toBase58());
    console.log("  ✔ Mint Authority 正确");

    // 断言2: Mint 账户的冻结授权方 (freezeAuthority) 也应该是我们的 PDA。
    expect(mintInfo.freezeAuthority.toBase58()).toEqual(pdaAuthority.toBase58());
    console.log("  ✔ Freeze Authority 正确");

    // 断言3: 小数位数 (decimals) 应与我们传入的一致。
    expect(mintInfo.decimals).toBe(decimals);
    console.log(`  ✔ Decimals 正确 (${mintInfo.decimals})`);

    // 断言4: 总供应量 (supply) 应等于我们初始铸造的数量。
    // 注意：`mintInfo.supply` 是 `bigint` 类型，而 `initialMintAmount` 是 `BN.js` 对象。
    // 将它们都转换为字符串进行比较是最安全可靠的方式。
    expect(mintInfo.supply.toString()).toBe(initialMintAmount.toString());
    console.log(`  ✔ Total Supply 正确 (${mintInfo.supply.toString()})`);

    // 断言5: Mint 账户本身的所有者 (owner) 应该是 SPL Token Program。
    // 我们使用从 getAccountInfo() 获取的 mintAccountInfo 对象来检查 owner。
    expect(mintAccountInfo.owner.toBase58()).toEqual(TOKEN_PROGRAM_ID.toBase58());
    console.log("  ✔ Owner 是 Token Program");

    // (B) 验证用户的关联 Token 账户 (ATA) 的状态
    const tokenAccountInfo = await getAccount(
      provider.connection,
      destinationAta
    );
    console.log("\n🔍 正在验证 Token 账户...");

    // 断言6: Token 账户的余额 (amount) 应等于我们初始铸造的数量。
    expect(tokenAccountInfo.amount.toString()).toBe(
      initialMintAmount.toString()
    );
    console.log(`  ✔ 账户余额正确 (${tokenAccountInfo.amount.toString()})`);

    // 断言7: Token 账户的数据结构中的 owner 字段（即谁拥有这些代币）应该是接收代币的用户。
    expect(tokenAccountInfo.owner.toBase58()).toEqual(user.publicKey.toBase58());
    console.log("  ✔ 账户所有者正确");

    // 断言8: Token 账户关联的 Mint (mint) 应该是我们刚刚创建的 Mint。
    expect(tokenAccountInfo.mint.toBase58()).toEqual(
      mintKeypair.publicKey.toBase58()
    );
    console.log("  ✔ 关联的 Mint 正确");

    console.log("\n🎉 所有测试用例通过! 程序功能符合预期。 🎉");
  });
});