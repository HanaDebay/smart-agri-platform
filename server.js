import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const mongoUri = (process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smart_agriculture').trim();
const jwtSecret = process.env.JWT_SECRET || 'development_secret_change_me';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://unpkg.com'],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https://images.unsplash.com']
    }
  }
}));
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['farmer', 'admin'], default: 'farmer' },
  location: { type: String, default: '' },
  farmSize: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const farmSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true },
  location: { type: String, default: '' },
  size: { type: Number, default: 0 },
  irrigationMode: { type: String, enum: ['manual', 'automatic'], default: 'manual' },
  pumpEnabled: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const soilDataSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  farm: { type: mongoose.Schema.Types.ObjectId, ref: 'Farm' },
  crop: { type: String, required: true },
  moisture: { type: Number, required: true, min: 0, max: 100 },
  ph: { type: Number, required: true, min: 0, max: 14 },
  nitrogen: { type: Number, required: true, min: 0 },
  phosphorus: { type: Number, required: true, min: 0 },
  potassium: { type: Number, required: true, min: 0 },
  source: { type: String, enum: ['manual', 'sensor'], default: 'manual' },
  createdAt: { type: Date, default: Date.now }
});

const recommendationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  soilData: { type: mongoose.Schema.Types.ObjectId, ref: 'SoilData', required: true },
  crop: { type: String, required: true },
  severity: { type: String, enum: ['healthy', 'watch', 'urgent'], default: 'watch' },
  fertilizer: [String],
  soilCorrection: [String],
  irrigation: String,
  biofortifiedCrop: String,
  actions: [String],
  createdAt: { type: Date, default: Date.now }
});

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, enum: ['soil', 'irrigation', 'system'], default: 'soil' },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Farm = mongoose.model('Farm', farmSchema);
const SoilData = mongoose.model('SoilData', soilDataSchema);
const Recommendation = mongoose.model('Recommendation', recommendationSchema);
const Notification = mongoose.model('Notification', notificationSchema);

function signToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role },
    jwtSecret,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    location: user.location,
    farmSize: user.farmSize
  };
}

async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = await User.findById(payload.id);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  return next();
}

function recommendationRules(input) {
  const crop = input.crop.toLowerCase();
  const fertilizer = [];
  const soilCorrection = [];
  const actions = [];
  let severityScore = 0;

  if (input.nitrogen < 35) {
    fertilizer.push('Apply urea or composted manure to improve nitrogen levels.');
    actions.push('Schedule nitrogen application before the next growth stage.');
    severityScore += 1;
  }
  if (input.phosphorus < 20) {
    fertilizer.push('Use DAP or phosphate-rich organic compost for phosphorus deficiency.');
    severityScore += 1;
  }
  if (input.potassium < 25) {
    fertilizer.push('Apply potassium-rich compost, ash, or MOP where available.');
    severityScore += 1;
  }

  if (input.ph < 5.5) {
    soilCorrection.push('Apply agricultural lime gradually to reduce soil acidity.');
    actions.push('Retest soil pH after lime has reacted with the soil.');
    severityScore += 1;
  } else if (input.ph > 7.8) {
    soilCorrection.push('Add organic matter and avoid over-liming to manage alkalinity.');
    severityScore += 1;
  } else {
    soilCorrection.push('Soil pH is within a favorable range for most selected crops.');
  }

  let irrigation = 'Moisture is adequate. Continue routine monitoring.';
  if (input.moisture < 30) {
    irrigation = 'Moisture is low. Irrigate today and mulch to reduce water loss.';
    actions.push('Check pump or water source availability.');
    severityScore += 2;
  } else if (input.moisture < 45) {
    irrigation = 'Moisture is moderate. Plan light irrigation if no rainfall is expected.';
    severityScore += 1;
  } else if (input.moisture > 80) {
    irrigation = 'Moisture is high. Pause irrigation and improve drainage if waterlogging appears.';
    severityScore += 1;
  }

  const biofortifiedMap = {
    maize: 'Vitamin A orange maize varieties',
    beans: 'Iron-rich bean varieties',
    cassava: 'Vitamin A yellow cassava varieties',
    millet: 'Iron and zinc-rich pearl millet varieties'
  };

  const biofortifiedCrop = biofortifiedMap[crop] || 'Choose locally approved biofortified seed varieties where available.';

  if (fertilizer.length === 0) {
    fertilizer.push('NPK levels look stable. Maintain soil fertility with compost and crop rotation.');
  }
  if (actions.length === 0) {
    actions.push('Keep monitoring soil every 2 to 4 weeks for trend analysis.');
  }

  return {
    severity: severityScore >= 3 ? 'urgent' : severityScore >= 1 ? 'watch' : 'healthy',
    fertilizer,
    soilCorrection,
    irrigation,
    biofortifiedCrop,
    actions
  };
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, location = '', farmSize = 0 } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: 'Email is already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash, location, farmSize });
    const farm = await Farm.create({
      user: user._id,
      name: `${name}'s Farm`,
      location,
      size: farmSize
    });

    res.status(201).json({ token: signToken(user), user: publicUser(user), farm });
  } catch (error) {
    res.status(500).json({ message: 'Registration failed', error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ message: 'Login failed', error: error.message });
  }
});

app.get('/api/profile', auth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.put('/api/profile', auth, async (req, res) => {
  const allowed = ['name', 'location', 'farmSize'];
  for (const field of allowed) {
    if (req.body[field] !== undefined) {
      req.user[field] = req.body[field];
    }
  }
  await req.user.save();
  res.json({ user: publicUser(req.user) });
});

app.get('/api/farms', auth, async (req, res) => {
  const farms = await Farm.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json({ farms });
});

app.post('/api/farms', auth, async (req, res) => {
  const { name, location = '', size = 0, irrigationMode = 'manual' } = req.body;
  if (!name) {
    return res.status(400).json({ message: 'Farm name is required' });
  }
  const farm = await Farm.create({ user: req.user._id, name, location, size, irrigationMode });
  res.status(201).json({ farm });
});

app.patch('/api/farms/:id/irrigation', auth, async (req, res) => {
  const { pumpEnabled, irrigationMode } = req.body;
  const farm = await Farm.findOne({ _id: req.params.id, user: req.user._id });
  if (!farm) {
    return res.status(404).json({ message: 'Farm not found' });
  }
  if (typeof pumpEnabled === 'boolean') farm.pumpEnabled = pumpEnabled;
  if (irrigationMode) farm.irrigationMode = irrigationMode;
  await farm.save();
  res.json({ farm });
});

app.post('/api/soil-data', auth, async (req, res) => {
  try {
    const required = ['crop', 'moisture', 'ph', 'nitrogen', 'phosphorus', 'potassium'];
    const missing = required.filter((field) => req.body[field] === undefined || req.body[field] === '');
    if (missing.length) {
      return res.status(400).json({ message: `Missing fields: ${missing.join(', ')}` });
    }

    const soilData = await SoilData.create({
      user: req.user._id,
      farm: req.body.farm || undefined,
      crop: req.body.crop,
      moisture: Number(req.body.moisture),
      ph: Number(req.body.ph),
      nitrogen: Number(req.body.nitrogen),
      phosphorus: Number(req.body.phosphorus),
      potassium: Number(req.body.potassium),
      source: req.body.source || 'manual'
    });

    const advice = recommendationRules(soilData);
    const recommendation = await Recommendation.create({
      user: req.user._id,
      soilData: soilData._id,
      crop: soilData.crop,
      ...advice
    });

    if (recommendation.severity !== 'healthy') {
      await Notification.create({
        user: req.user._id,
        title: recommendation.severity === 'urgent' ? 'Urgent farm action needed' : 'Farm condition needs attention',
        message: recommendation.actions[0],
        type: soilData.moisture < 45 ? 'irrigation' : 'soil'
      });
    }

    res.status(201).json({ soilData, recommendation });
  } catch (error) {
    res.status(400).json({ message: 'Could not save soil data', error: error.message });
  }
});

app.get('/api/soil-data', auth, async (req, res) => {
  const records = await SoilData.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50);
  res.json({ records });
});

app.get('/api/recommendations', auth, async (req, res) => {
  const recommendations = await Recommendation.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50);
  res.json({ recommendations });
});

app.get('/api/notifications', auth, async (req, res) => {
  const notifications = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(30);
  res.json({ notifications });
});

app.patch('/api/notifications/:id/read', auth, async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { read: true },
    { new: true }
  );
  if (!notification) {
    return res.status(404).json({ message: 'Notification not found' });
  }
  res.json({ notification });
});

app.get('/api/dashboard', auth, async (req, res) => {
  const [latestSoil, recommendations, notifications, farms] = await Promise.all([
    SoilData.findOne({ user: req.user._id }).sort({ createdAt: -1 }),
    Recommendation.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(5),
    Notification.find({ user: req.user._id, read: false }).sort({ createdAt: -1 }).limit(5),
    Farm.find({ user: req.user._id }).sort({ createdAt: -1 })
  ]);

  const history = await SoilData.find({ user: req.user._id }).sort({ createdAt: 1 }).limit(12);
  res.json({ latestSoil, recommendations, notifications, farms, history });
});

app.get('/api/admin/users', auth, requireAdmin, async (req, res) => {
  const users = await User.find().select('-passwordHash').sort({ createdAt: -1 }).limit(100);
  res.json({ users });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

mongoose
  .connect(mongoUri)
  .then(() => {
    app.listen(port, () => {
      console.log(`Smart Agriculture app running on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection failed:', error.message);
    if (error.message.includes('querySrv')) {
      console.error('Atlas DNS lookup failed. Check internet access, DNS settings, and whether your network allows SRV lookups for mongodb+srv:// connection strings.');
      console.error('If SRV lookups are blocked, copy the standard mongodb:// connection string from MongoDB Atlas instead of the mongodb+srv:// string.');
    }
    if (error.message.includes('bad auth') || error.message.includes('Authentication failed')) {
      console.error('Atlas authentication failed. Check the Database Access username/password and rotate the password if it was shared.');
    }
    if (error.message.includes('IP') || error.message.includes('whitelist')) {
      console.error('Atlas network access failed. Add your current IP address in Atlas Network Access, or use 0.0.0.0/0 only for development.');
    }
    process.exit(1);
  });
