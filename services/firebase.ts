// ------------------------------------------------------------------
// 数据库连接已禁用 (Database Disabled)
// 系统将使用浏览器本地存储 (LocalStorage)
// ------------------------------------------------------------------

// 导出 null 对象以满足其他文件的导入需求，但实际逻辑中不会被调用
export const db = null as any;

// 强制返回 false，使整个应用切换到本地存储模式
export const isFirebaseConfigured = () => {
  return false; 
};