import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, content) => fs.writeFileSync(path.join(root, file), content, 'utf8');

function replaceOnce(file, before, after, label) {
  const source = read(file);
  if (source.includes(after)) return false;
  if (!source.includes(before)) throw new Error(`Worker IPC patch target not found: ${label || file}`);
  write(file, source.replace(before, after));
  return true;
}

replaceOnce(
  'workers/local-worker.mjs',
  "const request=JSON.parse(Buffer.from(process.argv[2]||'', 'base64').toString('utf8')||'{}');",
  "function loadRequest(){\n  const requestFileIndex=process.argv.indexOf('--request-file');\n  if(requestFileIndex>=0){\n    const requestFile=process.argv[requestFileIndex+1];\n    if(!requestFile)throw new Error('Worker request file path is missing.');\n    return JSON.parse(fs.readFileSync(path.resolve(requestFile),'utf8'));\n  }\n  return JSON.parse(Buffer.from(process.argv[2]||'', 'base64').toString('utf8')||'{}');\n}\nconst request=loadRequest();",
  'worker request-file reader'
);

replaceOnce(
  'server/job-manager.mjs',
  "  const child = spawn(process.execPath, [workerFile, Buffer.from(JSON.stringify(payload)).toString('base64')], {\n    cwd: RUNTIME_ROOT,\n    stdio: ['ignore', 'pipe', 'pipe'],\n    windowsHide: true\n  });\n  active.set(jobId, child);",
  "  const requestFolder=path.join(RUNTIME_ROOT,'job-requests');\n  fs.mkdirSync(requestFolder,{recursive:true});\n  const requestFile=path.join(requestFolder,`${jobId}.json`);\n  fs.writeFileSync(requestFile,JSON.stringify(payload),'utf8');\n  const child = spawn(process.execPath, [workerFile, '--request-file', requestFile], {\n    cwd: RUNTIME_ROOT,\n    stdio: ['ignore', 'pipe', 'pipe'],\n    windowsHide: true,\n    shell: false\n  });\n  active.set(jobId, child);",
  'request-file worker spawn'
);

replaceOnce(
  'server/job-manager.mjs',
  "  child.stderr.on('data', chunk => { stderr += chunk.toString(); });\n  child.on('exit', (code, signal) => {\n    if (stdout.trim()) consume(stdout);\n    active.delete(jobId);",
  "  child.stderr.on('data', chunk => { stderr += chunk.toString(); });\n  child.on('error', error => { stderr += `${error.stack||error.message}\\n`; });\n  child.on('exit', (code, signal) => {\n    if (stdout.trim()) consume(stdout);\n    active.delete(jobId);\n    fs.rmSync(requestFile,{force:true});",
  'request-file cleanup'
);

replaceOnce(
  'server/job-manager.mjs',
  "  child.on('exit', (code, signal) => {\n    if (stdout.trim()) consume(stdout);\n    active.delete(jobId);\n    fs.rmSync(requestFile,{force:true});",
  "  child.on('close', (code, signal) => {\n    // `close` fires after stdout/stderr are drained. Using `exit` here races the\n    // worker's final JSON result on Windows and can incorrectly mark a completed\n    // Marketplace or provider job as failed.\n    if (stdout.trim()) consume(stdout);\n    active.delete(jobId);\n    fs.rmSync(requestFile,{force:true});",
  'wait for worker stdio close before final state'
);

console.log('Cross-platform worker request-file IPC and drained-close finalization applied.');
