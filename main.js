const { app, BrowserWindow, shell, ipcMain, dialog, Menu, protocol } = require('electron');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');
const zlib   = require('zlib');
const { exec } = require('child_process');

// ── Decryption (must match encrypt_bundle.py + Android) ──────────────────────
const AES_PASSWORD = 'IRazorSecretKey2025!';
const AES_SALT     = 'IRazorSalt1234567890';
const PBKDF2_ITER  = 65536;

function decryptBundle(encPath) {
  const raw  = fs.readFileSync(encPath);
  const iv   = raw.slice(0, 16);
  const ct   = raw.slice(16);
  const key  = crypto.pbkdf2Sync(AES_PASSWORD, AES_SALT, PBKDF2_ITER, 32, 'sha256');
  const dec  = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const zip  = Buffer.concat([dec.update(ct), dec.final()]);
  // zip is a ZIP — extract index.html
  const html = extractHtmlFromZip(zip);
  return html;
}

function extractHtmlFromZip(zipBuf) {
  // Simple ZIP parser — find index.html local file entry
  let pos = 0;
  while (pos < zipBuf.length - 4) {
    if (zipBuf.readUInt32LE(pos) !== 0x04034b50) { pos++; continue; }
    const compression   = zipBuf.readUInt16LE(pos + 8);
    const compSize      = zipBuf.readUInt32LE(pos + 18);
    const fnLen         = zipBuf.readUInt16LE(pos + 26);
    const extraLen      = zipBuf.readUInt16LE(pos + 28);
    const fname         = zipBuf.slice(pos + 30, pos + 30 + fnLen).toString('utf8');
    const dataStart     = pos + 30 + fnLen + extraLen;
    const compData      = zipBuf.slice(dataStart, dataStart + compSize);
    if (fname.endsWith('index.html')) {
      const inflated = compression === 8
        ? zlib.inflateRawSync(compData)
        : compData;
      return inflated.toString('utf8');
    }
    pos = dataStart + compSize;
  }
  throw new Error('index.html not found in bundle');
}

// ── Window ────────────────────────────────────────────────────────────────────
let win;
let _htmlContent = null;

function loadBundle() {
  const encPath = path.join(__dirname, 'app', 'bundle.enc');
  _htmlContent = decryptBundle(encPath);
}

function createWindow() {
  win = new BrowserWindow({
    width:  1100,
    height: 800,
    minWidth:  480,
    minHeight: 600,
    title: 'IRazor AI',
    backgroundColor: '#050508',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      webSecurity:      true,
      devTools:         false,   // disable DevTools in production
    },
    autoHideMenuBar: true,
  });

  Menu.setApplicationMenu(null);

  // Block Ctrl+Shift+I / F12 / Ctrl+U
  win.webContents.on('before-input-event', (event, input) => {
    const blocked = (
      (input.control && input.shift && input.key.toLowerCase() === 'i') ||
      (input.control && input.shift && input.key.toLowerCase() === 'j') ||
      (input.control && input.key.toLowerCase() === 'u') ||
      input.key === 'F12'
    );
    if (blocked) event.preventDefault();
  });

  // Load from RAM — never writes to disk
  win.loadURL('irazor://app/index.html');

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ── Custom protocol — serves HTML from RAM ────────────────────────────────────
app.whenReady().then(() => {
  protocol.registerStringProtocol('irazor', (request, callback) => {
    callback({ mimeType: 'text/html', data: _htmlContent });
  });

  try {
    loadBundle();
  } catch(e) {
    _htmlContent = `<html><body style="background:#050508;color:#f87171;font-family:monospace;padding:40px">
      <h2>IRazor AI — Decryption Error</h2><p>${e.message}</p></body></html>`;
  }

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ── File Bridge ───────────────────────────────────────────────────────────────
ipcMain.handle('bridge-readFile', (_, p) => {
  try { return fs.readFileSync(p).toString('base64'); }
  catch(e) { return JSON.stringify({ error: e.message }); }
});

ipcMain.handle('bridge-writeFile', (_, p, b64) => {
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, Buffer.from(b64, 'base64'));
    return true;
  } catch(e) { return false; }
});

ipcMain.handle('bridge-listDir', (_, p) => {
  try {
    return JSON.stringify(
      fs.readdirSync(p, { withFileTypes: true }).map(i => ({
        name: i.name, path: path.join(p, i.name),
        isDir: i.isDirectory(),
        size: i.isDirectory() ? 0 : fs.statSync(path.join(p, i.name)).size
      }))
    );
  } catch(e) { return JSON.stringify({ error: e.message }); }
});

ipcMain.handle('bridge-listDirRecursive', (_, p, maxDepth) => {
  const results = [];
  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let items; try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch(e) { return; }
    items.forEach(i => {
      const full = path.join(dir, i.name);
      results.push({ name: i.name, path: full, isDir: i.isDirectory(), size: i.isDirectory() ? 0 : (fs.statSync(full).size || 0), depth });
      if (i.isDirectory()) walk(full, depth + 1);
    });
  }
  walk(p, 0);
  return JSON.stringify(results);
});

ipcMain.handle('bridge-executeShell', (_, cmd) => new Promise(resolve => {
  exec(cmd, { timeout: 15000, maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
    resolve(JSON.stringify({ ok: !err, exit: err?.code || 0, stdout: (stdout||'').slice(0, 100000), stderr: (stderr||'').slice(0, 10000) }));
  });
}));

ipcMain.handle('bridge-searchInFiles', (_, dir, pattern, maxResults) => {
  const results = [];
  const skip = new Set(['png','jpg','jpeg','webp','gif','zip','exe','dll','so','db','jar','class']);
  function walk(f) {
    if (results.length >= maxResults) return;
    let stat; try { stat = fs.statSync(f); } catch(e) { return; }
    if (stat.isDirectory()) { try { fs.readdirSync(f).forEach(n => walk(path.join(f, n))); } catch(e) {} return; }
    if (skip.has(path.extname(f).slice(1).toLowerCase()) || stat.size > 5_000_000) return;
    try {
      fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (results.length < maxResults && line.toLowerCase().includes(pattern.toLowerCase()))
          results.push({ file: f, lineNumber: i + 1, line: line.trim().slice(0, 300) });
      });
    } catch(e) {}
  }
  walk(dir);
  return JSON.stringify(results);
});

ipcMain.handle('bridge-deleteFile', (_, p) => {
  try { fs.rmSync(p, { recursive: true, force: true }); return true; } catch(e) { return false; }
});

ipcMain.handle('bridge-createDir', (_, p) => {
  try { fs.mkdirSync(p, { recursive: true }); return true; } catch(e) { return false; }
});

ipcMain.handle('bridge-openFilePicker', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'] });
  if (r.canceled) return [];
  return r.filePaths.map(p => ({ path: p, name: path.basename(p), b64: fs.readFileSync(p).toString('base64') }));
});

ipcMain.handle('bridge-saveFilePicker', async (_, name, b64) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: name });
  if (r.canceled) return false;
  fs.writeFileSync(r.filePath, Buffer.from(b64, 'base64'));
  return true;
});
