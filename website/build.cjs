const { build } = require('./node_modules/vite/dist/node-cjs/publicUtils.cjs')
const path = require('path')

build({
  root: __dirname,
  build: {
    outDir: path.join(__dirname, 'dist'),
    emptyOutDir: true,
  },
}).then(() => {
  console.log('Build complete: ./dist/')
}).catch(err => {
  console.error('Build failed:', err)
  process.exit(1)
})
