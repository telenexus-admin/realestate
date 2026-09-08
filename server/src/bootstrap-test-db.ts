import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const {Client}=pg;
const here=dirname(fileURLToPath(import.meta.url));
const root=join(here,'..');
const files=['schema.sql','migrations/002_workflow_execution.sql','migrations/003_auth_security.sql','seed.sql'];
const client=new Client({connectionString:process.env.DATABASE_URL});
await client.connect();
try{
  for(const file of files){
    const sql=await readFile(join(root,file),'utf8');
    await client.query(sql);
    console.log(`applied ${file}`);
  }
}finally{await client.end();}
