/// <reference types="vite/client" />
/// <reference types="vite-plugin-comlink/client" />

interface ImportMetaEnv {
  readonly ANTHROPIC_API_KEY?: string;
  readonly VITE_ANTHROPIC_API_KEY?: string;
  readonly GEMINI_API_KEY?: string;
  readonly GOOGLE_API_KEY?: string;
  readonly VITE_GEMINI_API_KEY?: string;
  readonly OPENAI_API_KEY?: string;
  readonly VITE_OPENAI_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
