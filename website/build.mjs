import { build } from 'esbuild'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dist = resolve(__dirname, 'dist')

// 1. Clean and create dist
mkdirSync(dist, { recursive: true })

// 2. Build Tailwind CSS
console.log('Building CSS...')
execSync(
  `./node_modules/.bin/tailwindcss -i ./src/index.css -o ./dist/style.css --minify`,
  { stdio: 'inherit', cwd: __dirname }
)

// 3. Bundle JS with esbuild
console.log('Bundling JS...')
await build({
  entryPoints: ['src/main.tsx'],
  bundle: true,
  outfile: 'dist/main.js',
  platform: 'browser',
  format: 'esm',
  splitting: false,
  minify: true,
  jsx: 'automatic',
  jsxImportSource: 'react',
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  loader: {
    '.svg': 'dataurl',
    '.png': 'dataurl',
  },
})

// 4. Generate index.html
console.log('Generating index.html...')
const template = readFileSync(resolve(__dirname, 'index.html'), 'utf-8')
const html = template
  .replace('</head>', '  <link rel="stylesheet" href="/style.css">\n  </head>')
  .replace('<script type="module" src="/src/main.tsx"></script>', '<script type="module" src="/main.js"></script>')

writeFileSync(resolve(dist, 'index.html'), html)

console.log('Build complete → ./dist/')
