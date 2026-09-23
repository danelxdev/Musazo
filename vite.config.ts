import { defineConfig } from 'vite';

// En GitHub Pages la web vive en https://danelxdev.github.io/Musazo/, así que la
// compilación (y su vista previa) usan /Musazo/ como ruta base. En desarrollo sigue en la raíz.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/Musazo/' : '/',
}));
