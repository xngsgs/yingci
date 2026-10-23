import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
let failed = false;
for (const directory of ['src', 'public', 'test', 'scripts']) {
  for (const file of await readdir(directory)) {
    if (!file.endsWith('.mjs')) continue;
    const result = spawnSync(process.execPath, ['--check', join(directory, file)], { encoding: 'utf8' });
    if (result.status !== 0) { process.stderr.write(result.stderr); failed = true; }
  }
}
if (failed) process.exit(1);
console.log('所有 JavaScript 文件语法检查通过。');
