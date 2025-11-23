import { Command } from 'commander';
import fs from 'fs/promises';
import fsSync from 'fs';
import http from 'http';
import path from 'path';
import express from 'express';
import multer from 'multer';

// --- Configuration & CLI Setup ---
const program = new Command();

program
  .requiredOption('-h, --host <host>', 'Server address')
  .requiredOption('-p, --port <port>', 'Server port', parseInt)
  .requiredOption('-c, --cache <path>', 'Cache directory path');

program.parse(process.argv);
const opts = program.opts();
const CACHE_DIR = path.resolve(opts.cache);
const INVENTORY_FILE = path.join(CACHE_DIR, 'inventory.json');

// --- Helper: Ensure Cache ---
async function ensureEnvironment() {
  try {
    // Create cache dir if not exists
    await fs.mkdir(CACHE_DIR, { recursive: true }); 
    
    // Create empty inventory.json if not exists
    try {
      await fs.access(INVENTORY_FILE);
    } catch {
      await fs.writeFile(INVENTORY_FILE, JSON.stringify([]));
    }
    console.log(`Cache directory: ${CACHE_DIR}`);
  } catch (err) {
    console.error('Error setting up environment:', err);
    process.exit(1);
  }
}

// --- Helper: Read/Write Inventory ---
async function getInventory() {
  const data = await fs.readFile(INVENTORY_FILE, 'utf8');
  return JSON.parse(data);
}

async function saveInventory(data) {
  await fs.writeFile(INVENTORY_FILE, JSON.stringify(data, null, 2));
}

// --- Express Setup ---
const app = express();

// Multer setup for saving photos to CACHE_DIR 
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CACHE_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// Middleware for parsing JSON and URL-encoded bodies 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Routes Implementation (Part 2) ---

// 1. POST /register - Create new item
app.post('/register', upload.single('photo'), async (req, res) => {
  const { name, description } = req.body;

  if (!name) {
    return res.status(400).send('Bad Request: Name is required');
  }

  const newItem = {
    id: Date.now().toString(),
    name,
    description: description || '',
    photo: req.file ? req.file.filename : null
  };

  const inventory = await getInventory();
  inventory.push(newItem);
  await saveInventory(inventory);

  res.status(201).send('Created');
});

// 2. GET /inventory - List all items
app.get('/inventory', async (req, res) => {
  const inventory = await getInventory();
  // Add full photo URL to response
  const responseData = inventory.map(item => ({
    ...item,
    photoUrl: item.photo ? `http://${opts.host}:${opts.port}/inventory/${item.id}/photo` : null
  }));
  res.status(200).json(responseData);
});

// 3. GET /inventory/<ID> - Get specific item [cite: 48]
app.get('/inventory/:id', async (req, res) => {
  const inventory = await getInventory();
  const item = inventory.find(i => i.id === req.params.id);

  if (!item) return res.status(404).send('Not Found');

  res.status(200).json({
    ...item,
    photoUrl: item.photo ? `http://${opts.host}:${opts.port}/inventory/${item.id}/photo` : null
  });
});

// 4. PUT /inventory/<ID> - Update name/desc
app.put('/inventory/:id', async (req, res) => {
  const inventory = await getInventory();
  const index = inventory.findIndex(i => i.id === req.params.id);

  if (index === -1) return res.status(404).send('Not Found');

  // Update fields if provided
  if (req.body.name) inventory[index].name = req.body.name;
  if (req.body.description) inventory[index].description = req.body.description;

  await saveInventory(inventory);
  res.status(200).json(inventory[index]);
});

// 5. GET /inventory/<ID>/photo - Get photo file
app.get('/inventory/:id/photo', async (req, res) => {
  const inventory = await getInventory();
  const item = inventory.find(i => i.id === req.params.id);

  if (!item || !item.photo) return res.status(404).send('Not Found');

  const photoPath = path.join(CACHE_DIR, item.photo);
  
  // Check if file actually exists
  if (!fsSync.existsSync(photoPath)) return res.status(404).send('Photo file missing');

  res.setHeader('Content-Type', 'image/jpeg'); // [cite: 82]
  res.sendFile(photoPath);
});

// 6. PUT /inventory/<ID>/photo - Update photo
app.put('/inventory/:id/photo', upload.single('photo'), async (req, res) => {
  const inventory = await getInventory();
  const index = inventory.findIndex(i => i.id === req.params.id);

  if (index === -1) return res.status(404).send('Not Found');
  if (!req.file) return res.status(400).send('No photo uploaded');

  inventory[index].photo = req.file.filename;
  await saveInventory(inventory);
  
  res.status(200).send('Photo updated');
});

app.delete('/inventory/:id', async (req, res) => {
  let inventory = await getInventory();
  const exists = inventory.some(i => i.id === req.params.id);

  if (!exists) return res.status(404).send('Not Found');

  inventory = inventory.filter(i => i.id !== req.params.id);
  await saveInventory(inventory);
  
  res.status(200).send('Deleted');
});

app.get('/RegisterForm.html', (req, res) => {
  res.sendFile(path.resolve('RegisterForm.html'));
});

app.get('/SearchForm.html', (req, res) => {
  res.sendFile(path.resolve('SearchForm.html'));
});

// 9. POST /search - Search by ID
app.post('/search', async (req, res) => {
  const { id, has_photo } = req.body; 
  
  const inventory = await getInventory();
  const item = inventory.find(i => i.id === id);

  if (!item) return res.status(404).send('Not Found'); // [cite: 78]

  let result = { ...item };
  
  if (has_photo === 'on' || has_photo === 'true') {
     result.description += ` (Photo: http://${opts.host}:${opts.port}/inventory/${item.id}/photo)`;
  }

  res.status(200).json(result);
});

app.use((req, res) => {
  res.status(405).send('Method not allowed or Route not found'); 
});


// --- Server Startup ---
(async () => {
  await ensureEnvironment();
  
  // Pass the express app to http.createServer [cite: 43]
  const server = http.createServer(app); 
  
  server.listen(opts.port, opts.host, () => {
    console.log(`Server is running on http://${opts.host}:${opts.port}`);
  });
})();
