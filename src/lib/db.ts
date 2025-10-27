import mysql from "mysql2/promise";

// --- TÌM ĐƯỜNG DẪN SOCKET CỦA BẠN (Ví dụ: /var/run/mysqld/mysqld.sock) ---
const DEFAULT_SOCKET_PATH = process.env.NODE_ENV === "production" 
    ? "/var/run/mysqld/mysqld.sock" // Thay thế bằng đường dẫn bạn tìm thấy trên Server
    : undefined; // Để localhost/127.0.0.1 hoạt động trên môi trường dev/local

// Create connection pool
const pool = mysql.createPool({
    // Ưu tiên sử dụng Unix Socket Path
    socketPath: process.env.DB_SOCKET || DEFAULT_SOCKET_PATH, 
    
    // Chỉ sử dụng host/port nếu không có socketPath (chủ yếu cho môi trường dev local)
    host: process.env.DB_SOCKET ? undefined : (process.env.DB_HOST || "localhost"),
    port: process.env.DB_SOCKET ? undefined : (parseInt(process.env.DB_PORT || "3306")),

    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "pixpot",
    
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