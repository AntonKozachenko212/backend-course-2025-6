import { Command } from 'commander';
import fs from 'fs/promises';
import http from 'http';
import path from 'path';
import superagent from 'superagent';

const program = new Command();

program
  .requiredOption('-h, --host <host>')
  .requiredOption('-p, --port <port>', parseInt())
  .requiredOption('-c, --cache <path');

program.parse(process.argv);

const opts = program.opts();
const CACHE_DIR = path.resolve(opts.cache);

const server = http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('running\n');
});

async function ensureCacheDir() {
  try{
    await fs.mkdir(CACHE_DIR, {recursive: true});
    console.log('Cache DIR: ', CACHE_DIR);
  } catch(err){
    console.error('No cache directory', err);
    process.exit(1);
  }
}

(async () => {
  await ensureCacheDir();
  server.listen(opts.port, opts.host, () => {
    console.log(`Server is running on http://${opts.host}:${opts.port}`);
  });
})();
