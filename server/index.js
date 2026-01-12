const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// ------------------------------------------------------------------
// Google Cloud SQL / MySQL Configuration
// ------------------------------------------------------------------
// 请在 server/.env 文件中配置您的 Google Cloud SQL 凭证
// Please configure your Google Cloud SQL credentials in server/.env
const dbConfig = {
  host: process.env.DB_HOST,             // Google Cloud SQL Public IP
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,             // e.g., 'root'
  password: process.env.DB_PASSWORD,     // Your DB Password
  database: process.env.DB_NAME,         // e.g., 'reimburse_sys'
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 20000,
  // Google Cloud SQL 通常需要 SSL 连接，或者允许自签名证书
  ssl: {
    rejectUnauthorized: false
  }
};

// 检查必要的环境变量
if (!dbConfig.host || !dbConfig.user || !dbConfig.password || !dbConfig.database) {
  console.error('\n❌ Missing Database Configuration!');
  console.error('Please create a .env file in the "server" directory with the following variables:');
  console.error('DB_HOST=x.x.x.x (Google Cloud SQL Public IP)');
  console.error('DB_USER=your_username');
  console.error('DB_PASSWORD=your_password');
  console.error('DB_NAME=your_database_name');
  process.exit(1); // 停止服务，强制用户配置
}

const pool = mysql.createPool(dbConfig);

// --- 核心功能: 自动初始化数据库 ---
async function initializeDatabase() {
  console.log(`\n🔄 Connecting to Google Cloud SQL / Remote DB...`);
  console.log(`   Host: ${dbConfig.host}`);
  console.log(`   User: ${dbConfig.user}`);
  
  let connection;
  try {
    connection = await pool.getConnection();
    console.log('✅ Database connected successfully!');
    
    await connection.beginTransaction();

    // 1. Users Table (Updated with chinese_name)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        chinese_name VARCHAR(255) DEFAULT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        created_at BIGINT NOT NULL
      )
    `);

    // 2. Settings Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id VARCHAR(50) PRIMARY KEY,
        data JSON NOT NULL
      )
    `);

    // 3. Reimbursements Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS reimbursements (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        data JSON NOT NULL,
        created_at BIGINT NOT NULL,
        INDEX idx_user (user_id),
        INDEX idx_created (created_at)
      )
    `);

    // 4. Check/Update Admin
    const adminUsername = 'admin';
    const adminPassword = 'admin';
    
    const [users] = await connection.query('SELECT * FROM users WHERE username = ?', [adminUsername]);
    
    if (users.length === 0) {
      console.log(`👤 Creating default admin user (${adminUsername})...`);
      await connection.query(
        'INSERT INTO users (id, username, chinese_name, password, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        ['admin-001', adminUsername, '超级管理员', adminPassword, 'admin', Date.now()]
      );
    } else {
      console.log(`👤 Admin user (${adminUsername}) verified.`);
      // Optional: Reset admin password on restart if needed
      // await connection.query('UPDATE users SET password = ? WHERE username = ?', [adminPassword, adminUsername]);
    }

    await connection.commit();
    console.log('✅ Tables Verified. System Ready.\n');

  } catch (error) {
    if (connection) await connection.rollback();
    
    console.error('\n❌ FATAL DATABASE ERROR ❌');
    console.error(`Error Code: ${error.code}`);
    console.error(`Message: ${error.message}`);
    
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('\n⚠️  连接超时/被拒绝 (Connection Issue)');
      console.error('1. Google Cloud SQL: 请在控制台 "Authorized networks" 中添加您当前的公网 IP。');
      console.error('2. Google Cloud SQL: 确保实例已启动且拥有 Public IP。');
      console.error('3. 检查 .env 文件中的主机 IP 和密码是否正确。');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('\n⚠️  权限问题 (Auth Failed)');
      console.error('用户名或密码错误。');
    }
    
    console.error('\n');
    process.exit(1);
  } finally {
    if (connection) connection.release();
  }
}

// --- API Routes ---

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'error', database: 'disconnected', message: error.code || error.message });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM users');
    res.json(rows.map(row => ({
      id: row.id,
      username: row.username,
      chineseName: row.chinese_name, // Map snake_case to camelCase
      password: row.password,
      role: row.role,
      createdAt: Number(row.created_at)
    })));
  } catch (error) {
    console.error('API Error /users:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users', async (req, res) => {
  const { id, username, chineseName, password, role, createdAt } = req.body;
  try {
    await pool.query(
      'INSERT INTO users (id, username, chinese_name, password, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, username, chineseName, password, role, createdAt]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/settings', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT data FROM settings WHERE id = "global"');
    if (rows.length > 0) {
      res.json(rows[0].data);
    } else {
      res.json(null);
    }
  } catch (error) {
    console.error('API Error /settings:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/settings', async (req, res) => {
  const settingsData = req.body;
  try {
    await pool.query(
      'INSERT INTO settings (id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = ?',
      ['global', JSON.stringify(settingsData), JSON.stringify(settingsData)]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reimbursements', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM reimbursements ORDER BY created_at DESC LIMIT 500');
    const items = rows.map(row => {
      return { ...row.data, id: row.id };
    });
    res.json(items);
  } catch (error) {
    console.error('API Error /reimbursements:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/reimbursements', async (req, res) => {
  const item = req.body;
  try {
    await pool.query(
      'INSERT INTO reimbursements (id, user_id, data, created_at) VALUES (?, ?, ?, ?)',
      [item.id, item.userId, JSON.stringify(item), item.createdAt]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('API Error POST /reimbursements:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/reimbursements/bulk', async (req, res) => {
  const items = req.body;
  if (!Array.isArray(items) || items.length === 0) return res.json({ success: true });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const item of items) {
      await connection.query(
        'INSERT INTO reimbursements (id, user_id, data, created_at) VALUES (?, ?, ?, ?)',
        [item.id, item.userId, JSON.stringify(item), item.createdAt]
      );
    }
    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

app.put('/api/reimbursements/:id', async (req, res) => {
  const item = req.body;
  const id = req.params.id;
  try {
    await pool.query(
      'UPDATE reimbursements SET data = ?, created_at = ? WHERE id = ?',
      [JSON.stringify(item), item.createdAt, id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, async () => {
  console.log(`\n🚀 Backend Server Started at http://localhost:${PORT}`);
  // Start initialization immediately
  await initializeDatabase();
});
