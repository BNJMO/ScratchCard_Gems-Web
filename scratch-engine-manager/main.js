import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1180,
    height: 720,
    backgroundColor: '#0b1a24',
    title: 'Scratch Engine Manager',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile(path.join(__dirname, 'index.html'));
};

const getVariationsPath = () => {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'Variations');
  }
  return path.join(app.getAppPath(), 'Variations');
};

ipcMain.handle('list-variations', async () => {
  try {
    const variationsPath = getVariationsPath();
    const entries = await fs.readdir(variationsPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    console.error('Failed to load variations', error);
    return [];
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
