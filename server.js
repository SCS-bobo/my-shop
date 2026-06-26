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
const JWT_SECRET = process.env.JWT_SECRET || 'cle_secrete_sure_2026';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Variables Supabase manquantes");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// CORS complet
app.use(cors({ origin: "*", credentials: false }));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname)));

// Maintien en ligne
setInterval(() => {
  const https = require('https');
  https.get("https://my-shop-9l3j.onrender.com/ping", () => {})
    .on('error', () => {});
}, 90000);

app.get('/ping', (_, res) => res.send("OK"));
app.get('/', (_, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Inscription
app.post('/api/inscription', async (req, res) => {
  try {
    const { nom, email, telephone, motDePasse, role } = req.body;
    if (!nom || !email || !telephone || !motDePasse) {
      return res.json({ erreur: "Tous les champs sont obligatoires" });
    }
    const hash = await bcrypt.hash(motDePasse, 10);
    const { data, error } = await supabase.from('users').insert([{ nom, email, telephone, mot_de_passe: hash, role }]).select();
    if (error) return res.json({ erreur: error.code === '23505' ? "Email déjà utilisé" : error.message });
    const token = jwt.sign({ id: data[0].id, role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ succes: true, token });
  } catch (e) {
    res.json({ erreur: e.message });
  }
});

// Connexion
app.post('/api/connexion', async (req, res) => {
  try {
    const { email, motDePasse } = req.body;
    const { data, error } = await supabase.from('users').select('*').eq('email', email).single();
    if (error) return res.json({ erreur: "Identifiants invalides" });
    const ok = await bcrypt.compare(motDePasse, data.mot_de_passe);
    if (!ok) return res.json({ erreur: "Mot de passe incorrect" });
    const token = jwt.sign({ id: data.id, role: data.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ succes: true, token });
  } catch (e) {
    res.json({ erreur: e.message });
  }
});

app.get('/api/produits', async (_, res) => {
  const { data } = await supabase.from('produits').select('*');
  res.json(data || []);
});

app.listen(PORT, () => console.log("✅ Serveur prêt"));