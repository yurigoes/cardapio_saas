#!/usr/bin/env node
/**
 * Executa as migrations do banco de dados na ordem correta.
 * Uso: node scripts/migrate.js
 */

const { Pool } = require("pg");
const fs       = require("fs");
const path     = require("path");
require("dotenv").config();

const pool = new Pool({
  host:     process.env.DB_HOST     || "localhost",
  port:     parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME     || "cardapio_saas",
  user:     process.env.DB_USER     || "cardapio",
  password: process.env.DB_PASSWORD,
});

async function migrate() {
  const client = await pool.connect();

  try {
    // Tabela de controle de migrations
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id          SERIAL PRIMARY KEY,
        filename    VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDir = path.join(__dirname, "../database/migrations");
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const already = await client.query(
        "SELECT id FROM _migrations WHERE filename = $1",
        [file]
      );

      if (already.rows.length > 0) {
        console.log(`  ✓ ${file} (já executado)`);
        continue;
      }

      console.log(`  → Executando ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");

      await client.query(sql);
      await client.query(
        "INSERT INTO _migrations (filename) VALUES ($1)",
        [file]
      );

      console.log(`  ✓ ${file}`);
    }

    console.log("\n✅ Todas as migrations concluídas!");
  } catch (err) {
    console.error("\n❌ Erro na migration:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
