PANEL DE DOS IMÁGENES — VERCEL

1. Sube todos los archivos de esta carpeta a la raíz de tu repositorio.
2. No subas una carpeta exterior que contenga el proyecto: package.json debe quedar en la raíz.
3. Vercel instalará automáticamente la única dependencia (mongodb).
4. No se necesita comando de compilación: index.html, styles.css y app.js se sirven directamente.
5. La API queda en /api/imagenes.

CORRECCIÓN APLICADA:
- package-lock.json ahora usa https://registry.npmjs.org/
- .npmrc fuerza el registro público de npm
- se eliminaron referencias al registro interno que bloqueaban "Installing dependencies..."
