import mysql from "mysql2/promise";

// Create connection pool
const pool = mysql.createPool({
  host: process.env.NEXT_PUBLIC_DB_HOST || "localhost",
  port: parseInt(process.env.NEXT_PUBLIC_DB_PORT || "3306"),
  user: process.env.NEXT_PUBLIC_DB_USER || "root",
  password: process.env.NEXT_PUBLIC_DB_PASSWORD || "",
  database: process.env.NEXT_PUBLIC_DB_NAME || "pixpot",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export default pool;

// Helper to execute queries
export async function query<T = any>(sql: string, params?: any[]): Promise<T> {
  const [results] = await pool.execute(sql, params);
  return results as T;
}
