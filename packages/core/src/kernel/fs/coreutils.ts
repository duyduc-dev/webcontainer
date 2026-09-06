/**
 * Built-in programs, written as ordinary CommonJS Node programs that run
 * through the real vendored Node runtime in a process worker — installed as
 * `/bin/<name>.js` (see workers/fs/worker.ts), so from a program's point of
 * view they are just files on PATH, resolved and spawned exactly like any
 * user script (workers/kernel/processClient.ts's runShell()). `cd` is
 * deliberately absent: a subprocess cannot change its parent shell's cwd, so
 * it stays a true (async) shell builtin instead.
 *
 * Adapted from vivari's own hand-written packages/kernel-host/coreutils.js
 * (github.com/maitrungduc1410/vivari, MIT) — these are vivari's own shim
 * programs, not upstream GNU coreutils source, since Node has no coreutils of
 * its own to vendor. Dropped from the vivari originals: --color/TTY detection
 * in `ls` and the stdin fallback in `cat`, since this runtime has no TTY or
 * stdin concept yet.
 */
const COREUTILS: Record<string, string> = {
  echo: `process.stdout.write(process.argv.slice(2).join(' ') + '\\n');
process.exit(0);
`,

  pwd: `process.stdout.write(process.cwd() + '\\n');
process.exit(0);
`,

  true: `process.exit(0);
`,

  false: `process.exit(1);
`,

  cat: `const fs = require('fs');
const path = require('path');
const files = process.argv.slice(2);
if (!files.length) {
  process.stderr.write('cat: missing operand\\n');
  process.exit(1);
}
let rc = 0;
for (const a of files) {
  try {
    process.stdout.write(fs.readFileSync(path.resolve(process.cwd(), a)));
  } catch (e) {
    process.stderr.write('cat: ' + a + ': ' + (e.code || e.message) + '\\n');
    rc = 1;
  }
}
process.exit(rc);
`,

  ls: `const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2);
const args = argv.filter((a) => !a.startsWith('-'));
const target = args[0] ? path.resolve(process.cwd(), args[0]) : process.cwd();
try {
  const names = fs.readdirSync(target);
  if (names.length) process.stdout.write(names.join('\\n') + '\\n');
} catch (e) {
  process.stderr.write('ls: ' + (args[0] || '.') + ': ' + (e.code || e.message) + '\\n');
  process.exit(1);
}
process.exit(0);
`,

  mkdir: `const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2);
const recursive = argv.includes('-p');
const targets = argv.filter((a) => a !== '-p');
if (!targets.length) {
  process.stderr.write('mkdir: missing operand\\n');
  process.exit(1);
}
let rc = 0;
for (const d of targets) {
  try {
    fs.mkdirSync(path.resolve(process.cwd(), d), { recursive });
  } catch (e) {
    process.stderr.write('mkdir: ' + d + ': ' + (e.code || e.message) + '\\n');
    rc = 1;
  }
}
process.exit(rc);
`,

  rm: `const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith('-')).join('');
const recursive = flags.includes('r');
const force = flags.includes('f');
const targets = argv.filter((a) => !a.startsWith('-'));
if (!targets.length && !force) {
  process.stderr.write('rm: missing operand\\n');
  process.exit(1);
}
let rc = 0;
for (const f of targets) {
  try {
    fs.rmSync(path.resolve(process.cwd(), f), { recursive });
  } catch (e) {
    if (!force) {
      process.stderr.write('rm: ' + f + ': ' + (e.code || e.message) + '\\n');
      rc = 1;
    }
  }
}
process.exit(rc);
`,

  mv: `const fs = require('fs');
const path = require('path');
const [from, to] = process.argv.slice(2);
if (!from || !to) {
  process.stderr.write('mv: missing operand\\n');
  process.exit(1);
}
try {
  fs.renameSync(path.resolve(process.cwd(), from), path.resolve(process.cwd(), to));
  process.exit(0);
} catch (e) {
  process.stderr.write('mv: ' + (e.code || e.message) + '\\n');
  process.exit(1);
}
`,
};

export { COREUTILS };
