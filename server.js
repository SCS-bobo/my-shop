require('dotenv').config();
require('./keepalive'); // ✅ Appel du fichier de maintien en ligne
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Variables d'environnement
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const JWT_SECRET = process.env.JWT_SECRET;

// Vérification des variables
if (!SUPABASE_URL || !SUPABASE_KEY || !JWT_SECRET) {
  console.error("❌ Variables d'environnement manquantes !");
  process.exit(1);
}

// Connexion Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Configuration
app.use(cors({ origin: "*" }));
app.options("*", cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

// ✅ Point de test rapide
app.get('/ping', (req, res) => {
  res.json({ ok: true, message: "Serveur en ligne" });
});

// Page d'accueil
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Inscription
app.post('/api/inscription', async (req, res) => {
  try {
    const { nom, email, telephone, motDePasse, role } = req.body;
    const motCrypte = await bcrypt.hash(motDePasse, 10);

    const { data, error } = await supabase
      .from('users')
      .insert([{ nom, email, telephone, mot_de_passe: motCrypte, role }])
      .select();

    if (error) {
      return res.status(400).json({
        erreur: error.code === '23505' ? "Cet email est déjà utilisé" : error.message
      });
    }

    const token = jwt.sign({ id: data[0].id, role }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, utilisateur: data[0] });
  } catch (err) {
    res.status(500).json({ erreur: "Erreur serveur : " + err.message });
  }
});

// Connexion
app.post('/api/connexion', async (req, res) => {
  try {
    const { email, motDePasse } = req.body;

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !data) {
      return res.status(400).json({ erreur: "Email ou mot de passe incorrect" });
    }

    const valide = await bcrypt.compare(motDePasse, data.mot_de_passe);
    if (!valide) {
      return res.status(400).json({ erreur: "Mot de passe incorrect" });
    }

    const token = jwt.sign({ id: data.id, role: data.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, utilisateur: data });
  } catch (err) {
    res.status(500).json({ erreur: "Erreur serveur : " + err.message });
  }
});

// Liste des produits
app.get('/api/produits', async (req, res) => {
  try {
    const { data } = await supabase.from('produits').select('*');
    res.json(data || []);
  } catch {
    res.json([]);
  }
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`✅ Serveur prêt sur le port ${PORT}`);
});