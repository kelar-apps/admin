// Poppins is bundled (latin subset) so it is precached and works offline.
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-700.css';
import './core/theme.css';
import './admin/admin.css';
import { CLIENT_ID, missingConfig } from '../config.js';
import { preloadGis } from './core/auth.js';
import { setupPwa } from './core/pwa.js';
import { h, toast } from './core/ui.js';
import { startAdmin } from './admin/app.js';

const root = document.getElementById('app');
startAdmin(root);

// Load Google Identity Services in the background. The token is only requested on
// a tap (popups opened without a user gesture are blocked).
preloadGis(CLIENT_ID);
window.addEventListener('online', () => preloadGis(CLIENT_ID));

setupPwa({
  onNeedRefresh: (reload) => toast('Versi baru tersedia', { action: 'Muat ulang', onAction: reload, duration: 0 }),
});

const missing = missingConfig();
if (missing.length) {
  document.body.prepend(
    h('div', { class: 'dev-notice', style: 'max-width:480px;margin:8px auto' }, `${missing.join(', ')} belum diisi (lihat README.md).`),
  );
}
