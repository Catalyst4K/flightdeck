// Ambient declaration for the main process's build-time env vars (electron-vite's
// MAIN_VITE_ prefix — see .env.example). Same reasoning as vite-raw.d.ts: the renderer
// gets ImportMetaEnv typing for free via "vite/client", but that pulls in DOM globals
// inappropriate here, so it's declared directly for just what src/main actually uses.
interface ImportMetaEnv {
  readonly MAIN_VITE_SIMBRIEF_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
