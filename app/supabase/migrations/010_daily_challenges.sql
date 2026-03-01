-- Rework daily_challenges into a quiz pool (questions stored in DB, not code)
-- and fix daily_challenge_completions for pool-based rotation.

-- 1. Drop old unique constraint on challenge_date (we want many questions, not one per day)
ALTER TABLE daily_challenges DROP CONSTRAINT IF EXISTS daily_challenges_challenge_date_key;

-- 2. Add quiz-specific columns to daily_challenges
ALTER TABLE daily_challenges ADD COLUMN IF NOT EXISTS question TEXT;
ALTER TABLE daily_challenges ADD COLUMN IF NOT EXISTS options JSONB;        -- ["opt0","opt1","opt2","opt3"]
ALTER TABLE daily_challenges ADD COLUMN IF NOT EXISTS correct_index SMALLINT DEFAULT 0;
ALTER TABLE daily_challenges ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'fundamentals';
ALTER TABLE daily_challenges ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE daily_challenges ADD COLUMN IF NOT EXISTS sort_order SERIAL;

-- 3. Drop legacy columns no longer used by quiz-pool design
ALTER TABLE daily_challenges DROP COLUMN IF EXISTS title;
ALTER TABLE daily_challenges DROP COLUMN IF EXISTS description;
ALTER TABLE daily_challenges DROP COLUMN IF EXISTS challenge_type;
ALTER TABLE daily_challenges DROP COLUMN IF EXISTS challenge_data;
ALTER TABLE daily_challenges DROP COLUMN IF EXISTS challenge_date;

-- 4. Fix completions table: drop FK, use text challenge_id + date uniqueness
ALTER TABLE daily_challenge_completions
  DROP CONSTRAINT IF EXISTS daily_challenge_completions_challenge_id_fkey;

ALTER TABLE daily_challenge_completions
  ALTER COLUMN challenge_id TYPE TEXT USING challenge_id::TEXT;

ALTER TABLE daily_challenge_completions
  ADD COLUMN IF NOT EXISTS challenge_date DATE DEFAULT CURRENT_DATE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_completion_user_date
  ON daily_challenge_completions(user_id, challenge_date);

-- 5. Seed the quiz pool (30 Solana questions)
INSERT INTO daily_challenges (question, options, correct_index, xp_reward, category) VALUES
('What is the maximum theoretical TPS of Solana?', '["1,000 TPS","10,000 TPS","65,000 TPS","1,000,000 TPS"]', 2, 50, 'fundamentals'),
('What is Solana''s account model?', '["UTXO-based like Bitcoin","Account-based with program-owned data","Contract-based like Ethereum","DAG-based like IOTA"]', 1, 50, 'fundamentals'),
('What is a Program Derived Address (PDA)?', '["An address derived from seeds and a program ID that falls off the ed25519 curve","A randomly generated keypair","A wallet address owned by a user","A token mint address"]', 0, 50, 'programs'),
('Which Solana token standard supports extensions like non-transferable tokens?', '["SPL Token","Metaplex Token","Anchor Token","Token-2022 (Token Extensions)"]', 3, 50, 'tokens'),
('What does rent-exempt mean in Solana?', '["The account pays no fees","The account has enough SOL to avoid being garbage collected","The account is free to create","The account is owned by the system program"]', 1, 50, 'fundamentals'),
('What is the Anchor framework used for?', '["Building Solana programs with Rust macros and IDL generation","Creating React frontends","Managing Solana validator nodes","Deploying tokens on Ethereum"]', 0, 50, 'tooling'),
('What program manages fungible tokens on Solana?', '["System Program","BPF Loader","SPL Token Program","Metaplex Program"]', 2, 50, 'tokens'),
('What consensus mechanism does Solana use alongside Proof of Stake?', '["Proof of Work","Proof of Authority","Proof of Space","Proof of History"]', 3, 50, 'fundamentals'),
('What is a Cross-Program Invocation (CPI)?', '["A way to send SOL between wallets","When one on-chain program calls another program''s instruction","A client-side RPC call","A validator consensus message"]', 1, 50, 'programs'),
('What is the maximum size of a Solana transaction?', '["1,232 bytes","64 KB","1 MB","10 KB"]', 0, 50, 'fundamentals'),
('What is Metaplex Core?', '["A DeFi protocol","A validator client","A next-gen NFT standard with single-account assets","A token launchpad"]', 2, 50, 'tokens'),
('How are transaction fees structured on Solana?', '["Gas-based like Ethereum","Fixed base fee + priority fee per compute unit","Free for all transactions","Based on transaction size only"]', 1, 50, 'fundamentals'),
('What cryptographic curve do Solana keypairs use?', '["secp256k1","P-256","BLS12-381","Ed25519"]', 3, 50, 'fundamentals'),
('What does AMM stand for in DeFi?', '["Automated Market Maker","Automatic Money Manager","Algorithmic Mint Mechanism","Asset Management Module"]', 0, 50, 'defi'),
('How can a Solana program access the current timestamp?', '["Using System.currentTimeMillis()","Calling an RPC endpoint","Reading the Clock sysvar","It cannot access time"]', 2, 50, 'programs'),
('What serialization format does Anchor use by default?', '["Borsh (Binary Object Representation Serializer for Hashing)","JSON","Protocol Buffers","MessagePack"]', 0, 50, 'programs'),
('Which extension makes a Token-2022 token soulbound?', '["TransferFee","NonTransferable","InterestBearing","MemoTransfer"]', 1, 50, 'tokens'),
('What is the primary role of validators in Solana?', '["Mining new SOL tokens","Running smart contracts only","Storing NFT metadata","Processing transactions and maintaining consensus"]', 3, 50, 'fundamentals'),
('What are the three parts of a Solana instruction?', '["Sender, receiver, amount","Block, hash, signature","Program ID, accounts, and instruction data","Public key, private key, nonce"]', 2, 50, 'programs'),
('What does TVL stand for in DeFi?', '["Total Value Locked","Transaction Verification Layer","Token Validation Logic","Transfer Volume Limit"]', 0, 50, 'defi'),
('What is Sealevel in Solana''s architecture?', '["A consensus algorithm","The parallel smart contract runtime","A token standard","A validator client"]', 1, 50, 'fundamentals'),
('What is the default compute unit limit per instruction on Solana?', '["1,000 CU","10,000 CU","100,000 CU","200,000 CU"]', 3, 50, 'programs'),
('Which Metaplex standard uses a single account per NFT?', '["Token Metadata","Bubblegum (cNFTs)","Core","Candy Machine"]', 2, 50, 'tokens'),
('Why can''t a PDA sign transactions with a private key?', '["Because it''s not on the ed25519 curve, so no private key exists","Because it''s encrypted","Because it''s owned by the system program","It can sign transactions"]', 0, 50, 'programs'),
('What do you receive when staking SOL with a validator?', '["NFTs","Staking rewards from inflation and priority fees","Governance tokens","Nothing until unstaking"]', 1, 50, 'defi'),
('Which program owns all newly created wallet accounts on Solana?', '["Token Program","BPF Loader","Metaplex","System Program"]', 3, 50, 'fundamentals'),
('What is Jupiter in the Solana ecosystem?', '["A validator client","An NFT marketplace","A DEX aggregator for best swap routes","A stablecoin protocol"]', 2, 50, 'defi'),
('What do Versioned Transactions enable on Solana?', '["Address Lookup Tables for more accounts per transaction","Faster block times","Lower fees","Cross-chain transactions"]', 0, 50, 'fundamentals'),
('What is the purpose of an oracle in DeFi?', '["Validating transactions","Bringing off-chain data (like prices) on-chain","Creating new tokens","Managing liquidity pools"]', 1, 50, 'defi'),
('Which Solana cluster is used for testing with fake SOL?', '["Mainnet-beta","Testnet only","Localnet only","Devnet"]', 3, 50, 'fundamentals')
ON CONFLICT DO NOTHING;
