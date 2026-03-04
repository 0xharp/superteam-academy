-- Superteam Academy — Consolidated Schema
-- Single migration for fresh setups. Creates all tables, indexes, RLS, triggers, and seed data.

-- ═══════════════════════════════════════════════════════════════════════════
-- CLEANUP (idempotent)
-- ═══════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS post_likes CASCADE;
DROP TABLE IF EXISTS daily_challenge_completions CASCADE;
DROP TABLE IF EXISTS daily_challenges CASCADE;
DROP TABLE IF EXISTS xp_transactions CASCADE;
DROP TABLE IF EXISTS system_config CASCADE;
DROP TABLE IF EXISTS testimonials CASCADE;
DROP TABLE IF EXISTS community_posts CASCADE;
DROP TABLE IF EXISTS newsletter_subscribers CASCADE;
DROP TABLE IF EXISTS user_stats CASCADE;
DROP TABLE IF EXISTS accounts CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP FUNCTION IF EXISTS update_updated_at CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLES
-- ═══════════════════════════════════════════════════════════════════════════

-- Profiles (extended from NextAuth)
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE,
  display_name TEXT,
  email TEXT,
  bio TEXT,
  avatar_url TEXT,
  social_links JSONB DEFAULT '{}',
  wallet_address TEXT,
  is_public BOOLEAN DEFAULT true,
  preferred_language TEXT DEFAULT 'en',
  preferred_theme TEXT DEFAULT 'brazil',
  created_at TIMESTAMPTZ DEFAULT now(),
  email_notifications BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now(),
  is_admin BOOLEAN DEFAULT false,
  onboarded BOOLEAN DEFAULT false
);

-- Linked OAuth / wallet accounts (cross-provider sign-in)
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'oauth',
  access_token TEXT,
  refresh_token TEXT,
  expires_at BIGINT,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  UNIQUE(provider, provider_account_id)
);

-- User stats (streaks + cached XP mirror from on-chain sync)
-- XP & level are authoritative on-chain; total_xp here is a sync mirror for leaderboard queries.
-- Level is always derived from XP via calculateLevel() — not stored.
CREATE TABLE user_stats (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  total_xp INTEGER DEFAULT 0,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_activity_date DATE,
  streak_freezes INTEGER DEFAULT 3,
  streak_freezes_refreshed_at DATE,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Community posts (questions, discussions, replies)
CREATE TABLE community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT,
  content TEXT NOT NULL,
  course_id TEXT,
  parent_id UUID REFERENCES community_posts(id),
  upvotes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  type TEXT NOT NULL DEFAULT 'post',
  tags TEXT[] DEFAULT '{}'
);

-- Post likes (user ↔ post many-to-many)
CREATE TABLE post_likes (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  post_id UUID REFERENCES community_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

-- Daily challenges (quiz pool)
CREATE TABLE daily_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_index SMALLINT DEFAULT 0,
  xp_reward INTEGER DEFAULT 50,
  category TEXT DEFAULT 'fundamentals',
  is_active BOOLEAN DEFAULT true,
  sort_order SERIAL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Daily challenge completions (one per user per day)
CREATE TABLE daily_challenge_completions (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  challenge_id TEXT NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT now(),
  challenge_date DATE DEFAULT CURRENT_DATE,
  PRIMARY KEY (user_id, challenge_id)
);

-- XP transaction log (on-chain sourced via leaderboard sync)
CREATE TABLE xp_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  source TEXT NOT NULL,
  course_id TEXT,
  achievement_id TEXT,
  tx_signature TEXT,
  transaction_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tx_signature, user_id)
);

-- System config (key-value for sync tracking, rate limits)
CREATE TABLE system_config (
  key TEXT PRIMARY KEY,
  value TEXT,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Newsletter subscribers
CREATE TABLE newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  locale TEXT,
  subscribed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unsubscribed_at TIMESTAMPTZ
);

-- Testimonials (user-submitted, admin-curated for homepage)
CREATE TABLE testimonials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  quote TEXT NOT NULL,
  role TEXT,
  featured BOOLEAN DEFAULT false,
  featured_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX idx_accounts_user ON accounts(user_id);
CREATE INDEX idx_user_stats_total_xp ON user_stats(total_xp DESC);
CREATE INDEX idx_community_posts_user ON community_posts(user_id);
CREATE INDEX idx_community_posts_course ON community_posts(course_id);
CREATE INDEX idx_community_posts_parent ON community_posts(parent_id);
CREATE INDEX idx_community_posts_tags ON community_posts USING GIN(tags);
CREATE INDEX idx_xp_transactions_user ON xp_transactions(user_id);
CREATE INDEX idx_xp_transactions_transaction_at ON xp_transactions(transaction_at);
CREATE INDEX idx_xp_transactions_course_id ON xp_transactions(course_id);
CREATE INDEX idx_xp_transactions_achievement_id ON xp_transactions(achievement_id);
CREATE INDEX idx_xp_transactions_source ON xp_transactions(source);
CREATE INDEX idx_newsletter_email ON newsletter_subscribers(email);
CREATE INDEX idx_post_likes_post ON post_likes(post_id);
CREATE INDEX idx_testimonials_user ON testimonials(user_id);
CREATE INDEX idx_testimonials_featured ON testimonials(featured, featured_order);
CREATE UNIQUE INDEX uq_daily_completion_user_date ON daily_challenge_completions(user_id, challenge_date);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_challenge_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE xp_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY profiles_read ON profiles FOR SELECT USING (is_public = true OR id = (select auth.uid()));
CREATE POLICY profiles_write ON profiles FOR UPDATE USING (id = (select auth.uid()));

-- Accounts (service-role only — no anon/authenticated access)

-- Daily challenges (read-only for authenticated users)
CREATE POLICY challenges_read ON daily_challenges FOR SELECT USING (true);

-- Daily challenge completions (users can read/insert their own)
CREATE POLICY completions_read ON daily_challenge_completions FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY completions_write ON daily_challenge_completions FOR INSERT WITH CHECK (user_id = (select auth.uid()));

-- User stats (read public, write own — separate INSERT/UPDATE/DELETE to avoid overlapping SELECT)
CREATE POLICY stats_read ON user_stats FOR SELECT USING (true);
CREATE POLICY stats_insert ON user_stats FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY stats_update ON user_stats FOR UPDATE USING (user_id = (select auth.uid()));
CREATE POLICY stats_delete ON user_stats FOR DELETE USING (user_id = (select auth.uid()));

-- Community posts
CREATE POLICY posts_read ON community_posts FOR SELECT USING (true);
CREATE POLICY posts_write ON community_posts FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY posts_update ON community_posts FOR UPDATE USING (user_id = (select auth.uid()));

-- Post likes
CREATE POLICY likes_read ON post_likes FOR SELECT USING (true);
CREATE POLICY likes_write ON post_likes FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY likes_delete ON post_likes FOR DELETE USING (user_id = (select auth.uid()));

-- XP transactions
CREATE POLICY xp_read ON xp_transactions FOR SELECT USING (user_id = (select auth.uid()));

-- System config
CREATE POLICY system_config_read ON system_config FOR SELECT USING (true);

-- Newsletter (service-role only — no anon/authenticated access)

-- Testimonials
CREATE POLICY testimonials_read ON testimonials FOR SELECT USING (true);
CREATE POLICY testimonials_write ON testimonials FOR INSERT WITH CHECK (user_id = (select auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER user_stats_updated_at BEFORE UPDATE ON user_stats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER community_posts_updated_at BEFORE UPDATE ON community_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER system_config_updated_at BEFORE UPDATE ON system_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER testimonials_updated_at BEFORE UPDATE ON testimonials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- STORAGE
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY avatars_public_read ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');
CREATE POLICY avatars_service_insert ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars');
CREATE POLICY avatars_service_update ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars');

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED DATA
-- ═══════════════════════════════════════════════════════════════════════════

-- Sync markers
4
z   xc
714
-- Daily challenge quiz pool (30 Solana questions)
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
