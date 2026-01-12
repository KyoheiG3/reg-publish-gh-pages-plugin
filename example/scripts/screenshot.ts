import { chromium } from 'playwright'
import { createServer } from 'vite'
import { dirname, join } from 'node:path'

const __dirname = dirname(new URL(import.meta.url).pathname)

async function takeScreenshot() {
  const server = await createServer({
    root: join(__dirname, '..', 'src'),
    server: { port: 3000 },
  })

  await server.listen()

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 320, height: 240 } })
  await page.goto('http://localhost:3000')
  await page.screenshot({
    path: join(__dirname, '../__screenshots__', 'screenshot.png'),
  })

  await browser.close()
  await server.close()

  console.log('Screenshot saved to example/screenshot.png')
}

takeScreenshot()
