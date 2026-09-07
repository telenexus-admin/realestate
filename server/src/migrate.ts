import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const migrationsDir=path.resolve(here,'../migrations');

async function main(){
  const client=await pool.connect();
  try{
    await client.query('SELECT pg_advisory_lock($1)',[92834127]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations(
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const files=(await fs.readdir(migrationsDir)).filter(f=>f.endsWith('.sql')).sort();
    for(const filename of files){
      const applied=await client.query('SELECT 1 FROM schema_migrations WHERE filename=$1',[filename]);
      if(applied.rowCount){console.log(`skip ${filename}`);continue;}
      const sql=await fs.readFile(path.join(migrationsDir,filename),'utf8');
      console.log(`apply ${filename}`);
      await client.query('BEGIN');
      try{
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(filename) VALUES($1)',[filename]);
        await client.query('COMMIT');
      }catch(error){
        await client.query('ROLLBACK');
        throw error;
      }
    }
    console.log('Database migrations complete.');
  }finally{
    await client.query('SELECT pg_advisory_unlock($1)',[92834127]).catch(()=>undefined);
    client.release();
    await pool.end();
  }
}

main().catch(error=>{console.error(error);process.exitCode=1});
