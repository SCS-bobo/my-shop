require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const JWT_SECRET = process.env.JWT_SECRET || 'mon_secret_securise';

// Vérification
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Variables Supabase manquantes");
  process.exit(1);
}

// Connexion Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Maintien en ligne
setInterval(() => {
  const https = require('https');
  https.get(`https://${process.env.RENDER_EXTERNAL_URL || 'my-shop-9l3j.onrender.com'}/ping`, () => {})
  .on('error', () => {});
}, 120000);

// Configuration
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

// Ping
app.get('/ping', (req, res) => res.json({ ok: true }));

// Page d'accueil
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Inscription
app.post('/api/inscription', async (req, res) => {
  try {
    const { nom, email, telephone, motDePasse, role } = req.body;
    const motCrypte = await bcrypt.hash(motDePasse, 10);
    const { data, error } = await supabase.from('users').insert([{ nom, email, telephone, mot_de_passe: motCrypte, role }]).select();
    if (error) return res.status(400).json({ erreur: error.code === '23505' ? "Email déjà utilisé" : error.message });
    const token = jwt.sign({ id: data[0].id, role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, utilisateur: data[0] });
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

// Connexion
app.post('/api/connexion', async (req, res) => {
  try {
    const { email, motDePasse } = req.body;
    const { data, error } = await supabase.from('users').select('*').eq('email', email).single();
    if (error || !data) return res.status(400).json({ erreur: "Identifiants incorrects" });
    const valide = await bcrypt.compare(motDePasse, data.mot_de_passe);
    if (!valide) return res.status(400).json({ erreur: "Mot de passe invalide" });
    const token = jwt.sign({ id: data.id, role: data.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, utilisateur: data });
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

// Produits
app.get('/api/produits', async (req, res) => {
  try {
    const { data } = await supabase.from('produits').select('*');
    res.json(data || []);
  } catch {
    res.json([]);
  }
});

app.listen(PORT, () => console.log(`✅ Serveur démarré sur le port ${PORT}`));