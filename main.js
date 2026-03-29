const { app, BrowserWindow } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

// Serve the frontend directory over HTTP so renderer fetch() works correctly
const FRONTEND_DIR = path.join(__dirname, '../frontend');
const FRONTEND_PORT = 8080;

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

let server;

function startStaticServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      // Strip query string from URL
      const urlPath = req.url.split('?')[0];
      let filePath = path.join(FRONTEND_DIR, urlPath === '/' ? 'index.html' : urlPath);
      const ext = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not Found');
          return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      });
    });

    server.listen(FRONTEND_PORT, '127.0.0.1', () => {
      console.log(`Frontend server running on http://127.0.0.1:${FRONTEND_PORT}`);
      resolve();
    });
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Load frontend via HTTP instead of file:// so fetch() works correctly
  win.loadURL(`http://127.0.0.1:${FRONTEND_PORT}`);

  // Open DevTools for debugging (development only)
  try {
    win.webContents.openDevTools({ mode: 'detach' });
  } catch (e) {
    // ignore when running in production
  }
}

app.whenReady().then(async () => {
  await startStaticServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (server) server.close();
  if (process.platform !== 'darwin') app.quit();
});