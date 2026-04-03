import chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCALES_DIR = path.resolve(__dirname, '../locales');
const ADMIN_DIR = path.resolve(LOCALES_DIR, 'admin');
const PUBLIC_DIR = path.resolve(LOCALES_DIR, 'public');
const BUILD_DIR = path.resolve(LOCALES_DIR, 'build');

// Ensure build directory exists
if (!fs.existsSync(BUILD_DIR)) {
  fs.mkdirSync(BUILD_DIR, { recursive: true });
}

/**
 * Parse a single PO file and return structured JSON object.
 */
function parsePo(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const result = {};

  const lines = content.split('\n');
  let currentMsgctxt = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Capture msgctxt
    if (line.startsWith('msgctxt "')) {
      currentMsgctxt = line.substring(9, line.length - 1);
      continue;
    }

    // Process msgid/msgstr pairs
    if (
      line.startsWith('msgid "') &&
      i + 1 < lines.length &&
      lines[i + 1].trim().startsWith('msgstr "')
    ) {
      const msgid = line.substring(7, line.length - 1);
      const msgstr = lines[i + 1]
        .trim()
        .substring(8, lines[i + 1].trim().length - 1);

      // Skip empty msgid (header)
      if (msgid === '') continue;

      // Use msgctxt as namespace prefix, default to 'General'
      const prefix = currentMsgctxt || 'General';
      // Replace '.' in key with '@@@' for next-intl compatibility
      const key = msgid.replace(/\./g, '@@@').replace(/\\"/g, '"');

      if (!result[prefix]) {
        result[prefix] = {};
      }

      result[prefix][key] = msgstr.replace(/\\"/g, '"');

      // Reset msgctxt after processing
      currentMsgctxt = null;
    }
  }

  return result;
}

/**
 * Deep merge source into target (source wins on conflict).
 */
function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (
      typeof source[key] === 'object' &&
      source[key] !== null &&
      !Array.isArray(source[key])
    ) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

/**
 * Build merged JSON for a given locale by reading admin + public PO files.
 */
function buildLocaleJson(language) {
  const merged = {};

  const adminPo = path.join(ADMIN_DIR, `${language}.po`);
  const publicPo = path.join(PUBLIC_DIR, `${language}.po`);

  if (fs.existsSync(adminPo)) {
    deepMerge(merged, parsePo(adminPo));
  }

  if (fs.existsSync(publicPo)) {
    deepMerge(merged, parsePo(publicPo));
  }

  return merged;
}

/**
 * Process a PO file change — rebuild the JSON for the affected locale.
 */
function processPoFile(filePath) {
  try {
    console.log(`Processing: ${filePath}`);

    const language = path.basename(filePath, '.po');
    if (!language) return;

    const json = buildLocaleJson(language);

    const jsonFilePath = path.join(BUILD_DIR, `${language}.json`);
    fs.writeFileSync(jsonFilePath, JSON.stringify(json, null, 2));

    console.log(`Generated JSON: ${jsonFilePath}`);
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
  }
}

/**
 * Transform all PO files to JSON once.
 */
function transformPoFiles() {
  console.log('Transforming all PO files to JSON...');

  // Collect all unique locale codes from both admin and public dirs
  const locales = new Set();

  for (const dir of [ADMIN_DIR, PUBLIC_DIR]) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (file.endsWith('.po')) {
        locales.add(path.basename(file, '.po'));
      }
    }
  }

  if (locales.size === 0) {
    console.log('No PO files found.');
    return;
  }

  for (const locale of locales) {
    const json = buildLocaleJson(locale);
    const jsonFilePath = path.join(BUILD_DIR, `${locale}.json`);
    fs.writeFileSync(jsonFilePath, JSON.stringify(json, null, 2));
    console.log(`Generated JSON: ${jsonFilePath}`);
  }

  console.log('Transformation complete!');
}

/**
 * Watch PO files and transform them on changes.
 */
function watchPoFiles() {
  console.log(`Watching for changes in ${ADMIN_DIR} and ${PUBLIC_DIR}...`);

  const watcher = chokidar.watch([ADMIN_DIR, PUBLIC_DIR], {
    ignored: (_path, stats) => stats?.isFile() && !_path.endsWith('.po'),
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: {
      stabilityThreshold: 1000,
      pollInterval: 100,
    },
  });

  watcher
    .on('add', (file) => {
      console.log(`File added: ${file}`);
      processPoFile(file);
    })
    .on('change', (file) => {
      console.log(`File changed: ${file}`);
      processPoFile(file);
    })
    .on('error', (error) => {
      console.error(`Watcher error: ${error}`);
    });

  console.log('Watcher started. Press Ctrl+C to stop.');
}

// Determine mode from CLI args
const mode = process.argv[2];

if (mode === 'watch') {
  watchPoFiles();
} else {
  transformPoFiles();
}
