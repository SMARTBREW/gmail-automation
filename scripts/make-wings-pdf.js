#!/usr/bin/env node
/**
 * Generate PDF from Wings of Hope templates HTML.
 * Requires: npm install puppeteer
 * Run: node scripts/make-wings-pdf.js
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(__dirname, '../Wings-of-Hope-Templates.html');
const pdfPath = join(__dirname, '../Wings-of-Hope-Templates.pdf');

async function main() {
  let puppeteer;
  try {
    puppeteer = await import('puppeteer');
  } catch {
    console.error('Puppeteer not found. Run: npm install puppeteer');
    process.exit(1);
  }

  const html = readFileSync(htmlPath, 'utf8');
  const browser = await puppeteer.default.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
    printBackground: true,
  });
  await browser.close();
  console.log(`✅ PDF saved: ${pdfPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
