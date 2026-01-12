/**
 * Supabase 客户端配置
 * 用于连接 Supabase 云端数据库
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// 从环境变量获取 Supabase 配置
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// 验证配置是否完整
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '⚠️ Supabase 配置缺失。请在 .env.local 文件中配置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY'
  );
}

// 创建 Supabase 客户端实例
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // 禁用自动会话管理，使用自定义认证逻辑
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

/**
 * 检查 Supabase 连接状态
 * @returns 连接状态对象
 */
export const checkSupabaseConnection = async (): Promise<{ connected: boolean; error?: string }> => {
  try {
    const { error } = await supabase.from('users').select('id').limit(1);
    if (error) {
      return { connected: false, error: error.message };
    }
    return { connected: true };
  } catch (e: any) {
    return { connected: false, error: e.message || 'Unknown error' };
  }
};

export default supabase;
