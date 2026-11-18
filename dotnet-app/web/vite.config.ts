import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
export default defineConfig({ plugins: [react()], resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } }, build: { outDir: '../src/DgpPass.Server/wwwroot', emptyOutDir: true }, server: { proxy: { '/api': 'http://localhost:5080' } } });
