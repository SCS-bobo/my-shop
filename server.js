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
const JWT_SECRET = process.env.JWT_SECRET || 'cle_secrete_sure';

// Connexion
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Maintien en ligne SIMPLE
setInterval(() => {
  try { require('http').get(`http://localhost:${PORT}/ping`); } catch(e) {}
}, 60000);

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Ping immédiat
app.get('/ping', (_, res) => res.send('OK'));

app.get('/', (_, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Inscription
app.post('/api/inscription', async (req, res) => {
  try {
    const { nom, email, telephone, motDePasse, role } = req.body;
    const hash = await bcrypt.hash(motDePasse, 10);
    const { data, error } = await supabase.from('users').insert([{ nom, email, telephone, mot_de_passe: hash, role }]).select();
    if (error) return res.json({ erreur: error.code === '23505' ? 'Email déjà utilisé' : error.message });
    const token = jwt.sign({ id: data[0].id, role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ succes: true, token });
  } catch (e) { res.json({ erreur: e.message }); }
});

// Connexion
app.post('/api/connexion', async (req, res) => {
  try {
    const { email, motDePasse } = req.body;
    const { data, error } = await supabase.from('users').select('*').eq('email', email).single();
    if (error) return res.json({ erreur: 'Identifiants invalides' });
    const ok = await bcrypt.compare(motDePasse, data.mot_de_passe);
    if (!ok) return res.json({ erreur: 'Mot de passe incorrect' });
    const token = jwt.sign({ id: data.id, role: data.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ succes: true, token });
  } catch (e) { res.json({ erreur: e.message }); }
});

app.get('/api/produits', async (_, res) => {
  const { data } = await supabase.from('produits').select('*');
  res.json(data || []);
});

app.listen(PORT, () => console.log('Serveur prêt'));