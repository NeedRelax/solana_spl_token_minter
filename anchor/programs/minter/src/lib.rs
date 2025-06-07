// #![allow(clippy::result_large_err)] // 允许Clippy忽略大错误类型的警告

use anchor_lang::prelude::*; // 导入Anchor框架的核心模块
use anchor_spl::{
    associated_token::AssociatedToken, // 导入SPL关联Token账户支持
    token::{self, Mint, MintTo, Token, TokenAccount}, // 导入SPL Token相关类型和方法
};

declare_id!("FqzkXZdwYjurnUKetJCAvaUw5WAqbwzU6gZEwydeEfqS"); // 声明程序的ID

#[program] // 定义Anchor程序模块
pub mod minter {
    use super::*; // 导入父模块的定义
    // 创建并铸造新代币的指令
    pub fn create_token(
        ctx: Context<CreateToken>,
        decimals: u8,
        initial_amount: u64,
    ) -> Result<()> {
        // 检查初始铸造金额是否为0，防止无意义的铸造
        require!(initial_amount > 0, TokenError::InvalidMintAmount);

        // 构造CPI上下文，用于调用SPL Token的mint_to指令
        let cpi_accounts = MintTo {
            mint: ctx.accounts.mint.to_account_info(), // 代币的Mint账户
            to: ctx.accounts.destination_token_account.to_account_info(), // 接收者的Token账户
            authority: ctx.accounts.pda_authority.to_account_info(), // PDA铸币授权账户
        };
        let cpi_program = ctx.accounts.token_program.to_account_info(); // SPL Token程序的账户信息

        // 定义PDA的种子和bump值，确保签名唯一性
        let seeds: &[&[u8]] = &[b"mint_authority", &[ctx.bumps.pda_authority]];
        let signer_seeds: &[&[&[u8]]] = &[seeds];

        // 创建带签名的CPI上下文，用于调用mint_to
        let cpi_context = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);

        // 执行SPL Token的mint_to指令，铸造指定数量的代币
        token::mint_to(cpi_context, initial_amount)?;

        // 记录日志，输出铸造成功的详细信息
        msg!("Token created and minted successfully!");
        msg!("Mint Address: {}", ctx.accounts.mint.key());
        msg!(
            "Recipient Token Address: {}",
            ctx.accounts.destination_token_account.key()
        );
        msg!("Amount Minted: {}", initial_amount);

        Ok(()) // 返回成功结果
    }
}

// 自定义错误类型
#[error_code]
pub enum TokenError {
    #[msg("Initial mint amount must be greater than zero")]
    InvalidMintAmount, // 初始铸造金额无效
}

// 定义create_token指令所需的账户结构
#[derive(Accounts)]
#[instruction(decimals: u8)] // 允许在校验逻辑中使用decimals参数
pub struct CreateToken<'info> {
    // 新创建的Mint账户
    #[account(
        init, // 初始化Mint账户
        payer = user, // 由user支付创建费用
        mint::decimals = decimals, // 设置代币小数位数
        mint::authority = pda_authority, // 设置PDA为铸币授权方
        mint::freeze_authority = pda_authority, //  让 PDA 完全控制这个代币（包括冻结账户的能力），
    )]
    pub mint: Account<'info, Mint>, // 代币的Mint账户

    // PDA账户，作为铸币的唯一授权方
    /// CHECK: 这是PDA授权账户，只作为签名者参与，不需要数据校验
    #[account(
        seeds = [b"mint_authority"], // 使用"mint_authority"作为种子
        bump, // 自动推导bump值
    )]
    pub pda_authority: AccountInfo<'info>, // PDA账户信息

    // 接收者的关联Token账户（ATA）
    #[account(
        init_if_needed, // 如果ATA不存在则创建
        payer = user, // 由user支付创建费用
        associated_token::mint = mint, // 关联到新创建的Mint
        associated_token::authority = user, // ATA的所有者为user
    )]
    pub destination_token_account: Account<'info, TokenAccount>, // 接收者的Token账户

    // 交易的签名者，支付费用
    #[account(mut)] // 可变，因为余额会减少
    pub user: Signer<'info>, // 用户账户，必须签名

    // 系统程序，用于创建账户
    pub system_program: Program<'info, System>, // Solana系统程序

    // SPL Token程序，用于Mint初始化和代币铸造
    pub token_program: Program<'info, Token>, // SPL Token程序

    // 关联Token账户程序，用于创建ATA
    pub associated_token_program: Program<'info, AssociatedToken>, // SPL Associated Token程序
}
