import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
// `base` is "/" for local dev and is overridden in CI (VITE_BASE) so the app
// works under the GitHub Pages project path, e.g. /gothic-remake-lockpick-puzzle-solver/.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
});
