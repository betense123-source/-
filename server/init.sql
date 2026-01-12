-- ============================================
-- 智能报销系统 - Supabase 数据库架构
-- Smart Reimbursement System - Supabase Schema
-- ============================================

-- 1. 用户表 (Users Table)
-- 存储系统用户信息，包括管理员和普通用户
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  chinese_name TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at BIGINT NOT NULL
);

-- 创建用户名索引以加速登录查询
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- 2. 系统设置表 (Settings Table)
-- 存储全局系统配置，使用 JSONB 存储动态配置
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY DEFAULT 'global',
  data JSONB NOT NULL
);

-- 3. 报销申请表 (Reimbursements Table)
-- 存储所有报销申请记录
CREATE TABLE IF NOT EXISTS reimbursements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at BIGINT NOT NULL
);

-- 创建索引以优化查询性能
CREATE INDEX IF NOT EXISTS idx_reimbursements_user_id ON reimbursements(user_id);
CREATE INDEX IF NOT EXISTS idx_reimbursements_created_at ON reimbursements(created_at DESC);

-- 4. 初始化默认管理员账户
-- 注意：生产环境请修改默认密码
INSERT INTO users (id, username, password, chinese_name, role, created_at)
VALUES ('admin-001', 'admin', 'admin', '超级管理员', 'admin', EXTRACT(EPOCH FROM NOW()) * 1000)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- Row Level Security (RLS) 配置 - 可选
-- ============================================
-- 如果需要启用行级安全策略，取消以下注释

-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE reimbursements ENABLE ROW LEVEL SECURITY;

-- 允许匿名用户读取（用于登录验证）
-- CREATE POLICY "Allow anonymous read" ON users FOR SELECT USING (true);

-- 允许认证用户查看自己的报销记录
-- CREATE POLICY "Users can view own reimbursements" ON reimbursements 
--   FOR SELECT USING (user_id = current_setting('app.current_user_id', true));
