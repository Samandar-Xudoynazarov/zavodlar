// Frontend build'ini serverga yuklash uchun tar.gz qiladi: tmp/deploy-frontend/frontend-update.tar.gz
// Ichida faqat .next papkasi bor (node_modules, .env va build keshi kirmaydi).
// Server zip qabul qilmagani uchun tar.gz ishlatiladi. Har ishga tushganda eski update fayllari o'chiriladi.
const fs = require('node:fs/promises'), path = require('node:path'), zlib = require('node:zlib');

/* ---------- oddiy tar (ustar + uzun nomlar uchun PAX sarlavha) ---------- */
function header(name, size, type, mtime) {
  const b = Buffer.alloc(512);
  const put = (s, off, len) => b.write(s, off, len, 'utf8');
  const oct = (n, len) => n.toString(8).padStart(len - 1, '0') + '\0';
  put(name, 0, 100);
  put(oct(type === '5' ? 0o755 : 0o644, 8), 100, 8);
  put(oct(0, 8), 108, 8); put(oct(0, 8), 116, 8);
  put(oct(size, 12), 124, 12);
  put(oct(mtime, 12), 136, 12);
  b.fill(' ', 148, 156);
  put(type, 156, 1);
  put('ustar\0', 257, 6); put('00', 263, 2);
  let sum = 0; for (const x of b) sum += x;
  put(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return b;
}
const pad = (n) => Buffer.alloc((512 - (n % 512)) % 512);
function entry(name, data, type, mtime) {
  const out = [];
  if (Buffer.byteLength(name) > 99) {
    // PAX: "LEN path=...\n" — LEN o'zini ham hisobga oladi
    const rec = (len) => `${len} path=${name}\n`;
    let len = Buffer.byteLength(rec(0)); while (Buffer.byteLength(rec(len)) !== len) len = Buffer.byteLength(rec(len));
    const pax = Buffer.from(rec(len));
    out.push(header('PaxHeader/' + path.posix.basename(name).slice(0, 80), pax.length, 'x', mtime), pax, pad(pax.length));
  }
  out.push(header(name.slice(0, 99), data.length, type, mtime));
  if (data.length) out.push(data, pad(data.length));
  return out;
}

(async () => {
  const frontend = path.resolve(__dirname, '..'), build = path.join(frontend, '.next');
  await fs.access(path.join(build, 'BUILD_ID'));
  const root = await fs.realpath(frontend);
  const target = path.resolve(frontend, '../tmp/deploy-frontend');
  await fs.mkdir(target, { recursive: true });
  // eski update fayllari qolib ketmasin
  for (const old of ['frontend-update.zip', 'frontend-update.tar.gz', 'frontend-update.tgz']) {
    await fs.rm(path.join(target, old), { force: true });
  }
  const parts = [];
  const mtime = Math.floor(Date.now() / 1000);
  // Next 16 (Turbopack) .next/node_modules ichida symlink yaratadi — haqiqiy fayllar bilan ko'chiriladi.
  // Frontend papkasidan tashqariga olib boradigan symlink bo'lsa, xavfsizlik uchun to'xtaydi.
  async function add(dir, prefix) {
    parts.push(...entry(prefix + '/', Buffer.alloc(0), '5', mtime));
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      if (e.name === 'cache' || (prefix === '.next' && e.name === 'dev')) continue;
      let source = path.join(dir, e.name); const name = prefix + '/' + e.name; let stat = e;
      if (e.isSymbolicLink()) {
        const real = await fs.realpath(source);
        if (real !== root && !real.startsWith(root + path.sep)) throw new Error('Build ichida frontend papkasidan tashqariga olib boruvchi symlink: ' + name + ' -> ' + real);
        source = real; stat = await fs.stat(real); console.log('symlink nusxalandi: ' + name);
      }
      if (stat.isDirectory()) await add(source, name);
      else if (stat.isFile()) parts.push(...entry(name, await fs.readFile(source), '0', mtime));
    }
  }
  await add(build, '.next');
  parts.push(Buffer.alloc(1024)); // tar oxiri
  const body = zlib.gzipSync(Buffer.concat(parts), { level: 6 });
  const output = path.join(target, 'frontend-update.tar.gz');
  await fs.writeFile(output, body);
  console.log('Tayyor: ' + output + ' (' + (body.length / 1024 / 1024).toFixed(1) + ' MB). Faqat .next papkasi; node_modules, .env va build keshi kiritilmadi.');
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
