import { defineConfig } from 'vite';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  build: {
    // Only bundle the offscreen OCR worker; all other extension files load directly from source.
    outDir: 'offscreen',
    emptyOutDir: false,
    copyPublicDir: false,
    rollupOptions: {
      input: resolve(__dirname, 'offscreen/ocr-worker.src.js'),
      output: {
        entryFileNames: 'ocr-worker.bundle.js',
        // IIFE so the offscreen HTML can load it via a plain <script> tag.
        format: 'iife',
        name: 'OcrWorker',
        // Prevent Rollup from splitting chunks; one self-contained file is simpler.
        inlineDynamicImports: true,
      },
    },
    // Keep readable for extension store review and easier debugging.
    minify: false,
    sourcemap: false,
  },
  plugins: [
    viteStaticCopy({
      targets: [
        // Tesseract.js web worker script — must be accessible at a chrome-extension:// URL
        // so the offscreen document can spawn a Worker from it.
        {
          src: 'node_modules/tesseract.js/dist/worker.min.js',
          dest: '../vendor/tesseract',
        },
        // WASM core files (JS wrappers that embed the WASM binary as base64).
        // Both SIMD and non-SIMD variants are needed for cross-device fallback.
        // "lstm-only" variants are used when lstmOnly:true is passed to createWorker,
        // reducing memory footprint for text detection tasks.
        {
          src: 'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
          dest: '../vendor/tesseract',
        },
        {
          src: 'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js',
          dest: '../vendor/tesseract',
        },
      ],
    }),
  ],
});
