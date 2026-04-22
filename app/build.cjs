#!/usr/bin/env node
const { build } = require('esbuild')
const { execSync } = require('child_process')
const { mkdirSync, writeFileSync } = require('fs')
const path = require('path')

const watch = process.argv.includes('--watch')
const dev = process.argv.includes('--dev') || watch

const baseDir = __dirname

mkdirSync(path.join(baseDir, 'dist-electron'), { recursive: true })
mkdirSync(path.join(baseDir, 'dist-renderer'), { recursive: true })

const commonOptions = {
  bundle: true,
  sourcemap: dev ? 'inline' : false,
  minify: !dev,
}

async function buildAll() {
  console.log('Building main process...')
  await build({
    ...commonOptions,
    entryPoints: ['electron/main.ts'],
    outfile: 'dist-electron/main.js',
    platform: 'node',
    format: 'cjs',
    external: ['electron', 'proxy-agent'],
    define: {
      'process.env.NODE_ENV': dev ? '"development"' : '"production"',
    },
  })

  console.log('Building preload...')
  await build({
    ...commonOptions,
    entryPoints: ['electron/preload.ts'],
    outfile: 'dist-electron/preload.js',
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
  })

  console.log('Building CSS...')
  execSync(
    `./node_modules/.bin/tailwindcss -i ./src/index.css -o ./dist-renderer/style.css${dev ? '' : ' --minify'}`,
    { stdio: 'inherit', cwd: baseDir }
  )

  console.log('Building renderer...')
  await build({
    ...commonOptions,
    entryPoints: ['src/main.tsx'],
    outfile: 'dist-renderer/renderer.js',
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    jsxImportSource: 'react',
    define: {
      'process.env.NODE_ENV': dev ? '"development"' : '"production"',
    },
    loader: {
      '.svg': 'dataurl',
      '.png': 'dataurl',
    },
  })

  // Write renderer index.html
  writeFileSync(
    path.join(baseDir, 'dist-renderer', 'index.html'),
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';" />
  <title>OMYKB</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <div id="root"></div>
  <script src="renderer.js"></script>
</body>
</html>`
  )

  console.log('Build complete.')
}

buildAll().catch(err => {
  console.error(err)
  process.exit(1)
})
