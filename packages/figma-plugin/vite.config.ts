import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'path';

export default defineConfig({
    root: resolve(__dirname, 'src/ui'),
    plugins: [react(), viteSingleFile()],
    build: {
        outDir: resolve(__dirname, 'dist'),
        emptyOutDir: false,
        rollupOptions: {
            input: resolve(__dirname, 'src/ui/ui.html'),
        },
    },
});
