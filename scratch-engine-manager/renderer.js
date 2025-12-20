const tabContent = document.getElementById('tab-content');
const tabs = document.querySelectorAll('.tab');
const variationSelect = document.getElementById('variation-select');

const contentByTab = {
  log: `[INFO] Starting Vite development server...\n\nThe game will open automatically in your browser.\nIf not, navigate to: http://localhost:3000\n\nPress Ctrl+C to stop the server.\n\n> mines-web@1.0.0 dev\n> vite\n\n▲ WARNING The "assert" keyword is not supported in the config\n  vite.config.js:3:45\n  3 | import buildConfig from './buildConfig.json'\n    |                                         ^\n\nDid you mean to use "with" instead of "assert"?\n\nPort 3000 is in use, trying another one...\nPort 3001 is in use, trying another one...\n\nVITE v5.4.20 ready in 663 ms\n\n➜ Local:   http://localhost:3002/Mines-Demo/\n   Network: use --host to expose\n   press h + enter to show help`,
  'game-config': `{
  "variation": "Select One...",
  "assetsPath": "./Variations/<variation>/assets",
  "gameTitle": "Scratch Engine"
}`,
  'build-config': `{
  "outputDir": "./dist",
  "minify": true,
  "sourcemap": false
}`,
};

const setActiveTab = (tabId) => {
  tabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === tabId);
  });
  tabContent.textContent = contentByTab[tabId] || '';
};

tabs.forEach((tab) => {
  tab.addEventListener('click', () => setActiveTab(tab.dataset.tab));
});

const loadVariations = async () => {
  const fallback = ['Mines-Demo', 'Mines-Gold', 'Mines-Classic'];
  try {
    if (window.scratchEngineManager?.listVariations) {
      const variations = await window.scratchEngineManager.listVariations();
      return variations.length ? variations : fallback;
    }
  } catch (error) {
    console.warn('Unable to load variations from app API', error);
  }
  return fallback;
};

const populateVariations = async () => {
  const variations = await loadVariations();
  variations.forEach((variation) => {
    const option = document.createElement('option');
    option.value = variation;
    option.textContent = variation;
    variationSelect.appendChild(option);
  });
};

setActiveTab('log');
populateVariations();
