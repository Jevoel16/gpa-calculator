-- Run this in MySQL to set up the database
CREATE DATABASE IF NOT EXISTS gpa_app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE gpa_app;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(191) NOT NULL UNIQUE,
  google_sub VARCHAR(64) NULL UNIQUE,
  github_id BIGINT UNSIGNED NULL UNIQUE,
  password_hash VARCHAR(191) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Session store table (created automatically by express-mysql-session, included for reference)
CREATE TABLE IF NOT EXISTS sessions (
  session_id VARCHAR(128) NOT NULL PRIMARY KEY,
  expires INT(11) UNSIGNED NOT NULL,
  data MEDIUMTEXT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS gpa_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  term_name VARCHAR(100) NOT NULL,
  courses_json JSON NOT NULL,
  gpa DECIMAL(6,5) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_gpa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS cgpa_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  record_name VARCHAR(100) NOT NULL,
  cgpa_data JSON NOT NULL,
  cgpa DECIMAL(6,5) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cgpa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;