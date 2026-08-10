CREATE DATABASE IF NOT EXISTS facturacion_electronica_sv
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE facturacion_electronica_sv;

CREATE TABLE IF NOT EXISTS system_status (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO system_status (name, status)
SELECT 'database', 'ready'
WHERE NOT EXISTS (
    SELECT 1 FROM system_status WHERE name = 'database'
);