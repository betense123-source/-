/**
 * 认证服务 - Supabase 版本
 * 处理用户登录、注册、会话管理等功能
 */

import { User } from '../types';
import { supabase } from './supabaseClient';

const SESSION_KEY = 'smart_reimburse_session';

// --- 类型定义 ---

/** 数据库用户记录类型 (snake_case) */
interface DbUser {
  id: string;
  username: string;
  password: string;
  chinese_name: string | null;
  role: 'admin' | 'user';
  created_at: number;
}

/** 健康检查状态类型 */
export type HealthStatus = { status: 'ok' | 'error'; message: string };

// --- 辅助函数 ---

/**
 * 将数据库用户记录转换为前端 User 类型
 */
const mapDbUserToUser = (dbUser: DbUser): User => ({
  id: dbUser.id,
  username: dbUser.username,
  password: dbUser.password,
  chineseName: dbUser.chinese_name || '',
  role: dbUser.role,
  createdAt: dbUser.created_at,
});

/**
 * 将前端 User 类型转换为数据库格式
 */
const mapUserToDbUser = (user: User): DbUser => ({
  id: user.id,
  username: user.username,
  password: user.password,
  chinese_name: user.chineseName || null,
  role: user.role,
  created_at: user.createdAt,
});

// --- API 函数 ---

/**
 * 检查后端健康状态
 */
export const checkBackendHealth = async (): Promise<HealthStatus> => {
  try {
    const { error } = await supabase.from('users').select('id').limit(1);
    if (error) {
      return { status: 'error', message: error.message };
    }
    return { status: 'ok', message: 'Supabase Connected' };
  } catch (e: any) {
    return { status: 'error', message: e.message || 'Connection failed' };
  }
};

/**
 * 获取所有用户列表
 */
export const getUsers = async (): Promise<User[]> => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('获取用户列表失败:', error.message);
      return [];
    }

    return (data as DbUser[]).map(mapDbUserToUser);
  } catch (e) {
    console.error('获取用户列表异常:', e);
    return [];
  }
};

/**
 * 保存新用户
 */
export const saveUser = async (user: User): Promise<void> => {
  try {
    const dbUser = mapUserToDbUser(user);
    const { error } = await supabase.from('users').insert(dbUser);

    if (error) {
      console.error('保存用户失败:', error.message);
      throw new Error(error.message);
    }
  } catch (e: any) {
    console.error('保存用户异常:', e);
    throw e;
  }
};

/**
 * 删除用户
 */
export const deleteUser = async (userId: string): Promise<void> => {
  try {
    // 检查是否为超级管理员
    const { data } = await supabase
      .from('users')
      .select('username')
      .eq('id', userId)
      .single();

    if (data?.username === 'admin') {
      alert('无法删除超级管理员');
      return;
    }

    const { error } = await supabase.from('users').delete().eq('id', userId);

    if (error) {
      console.error('删除用户失败:', error.message);
      throw new Error(error.message);
    }
  } catch (e: any) {
    console.error('删除用户异常:', e);
    throw e;
  }
};

/**
 * 初始化管理员账户（如果不存在）
 */
export const initAdmin = async (): Promise<void> => {
  try {
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('username', 'admin')
      .single();

    if (!data) {
      // 创建默认管理员
      const defaultAdmin: User = {
        id: 'admin-001',
        username: 'admin',
        password: 'admin',
        chineseName: '超级管理员',
        role: 'admin',
        createdAt: Date.now(),
      };
      await saveUser(defaultAdmin);
      console.log('默认管理员账户已创建');
    }
  } catch (e) {
    // 忽略错误，可能是首次访问
    console.log('管理员检查完成');
  }
};

/**
 * 用户登录
 */
export const login = async (username: string, password: string): Promise<User | null> => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .eq('password', password)
      .single();

    if (error || !data) {
      console.log('登录失败：用户名或密码错误');
      return null;
    }

    const user = mapDbUserToUser(data as DbUser);

    // 保存会话到 LocalStorage
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));

    return user;
  } catch (e) {
    console.error('登录异常:', e);
    return null;
  }
};

/**
 * 用户登出
 */
export const logout = (): void => {
  localStorage.removeItem(SESSION_KEY);
};

/**
 * 获取当前登录用户
 */
export const getCurrentUser = (): User | null => {
  try {
    const session = localStorage.getItem(SESSION_KEY);
    return session ? JSON.parse(session) : null;
  } catch (e) {
    return null;
  }
};

// 兼容性导出
export const getApiUrl = () => '';
