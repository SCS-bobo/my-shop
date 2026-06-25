require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Vérification des variables d'environnement
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY || !process.env.JWT_SECRET) {
  console.error("❌ Variables d'environnement manquantes !");
  process.exit(1);
}

// Connexion Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// CORS totalement ouvert
app.use(cors({
  origin: "*",
  credentials: false,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.options("*", cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

// Point de test rapide pour réveiller le serveur
app.get('/api/ping', (req, res) => {
  res.json({ ok: true, message: "Serveur prêt" });
});

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ erreur: 'Accès non autorisé' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ erreur: 'Token invalide ou expiré' });
  }
};

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
      if (error.code === '23505') {
        return res.status(400).json({ erreur: "Cet email est déjà utilisé" });
      }
      return res.status(400).json({ erreur: error.message });
    }

    const token = jwt.sign({ id: data[0].id, role: data[0].role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, utilisateur: { id: data[0].id, nom, email, role } });
  } catch (err) {
    res.status(500).json({ erreur: err.message });
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

    if (error || !data) return res.status(400).json({ erreur: 'Email ou mot de passe incorrect' });

    const valide = await bcrypt.compare(motDePasse, data.mot_de_passe);
    if (!valide) return res.status(400).json({ erreur: 'Email ou mot de passe incorrect' });

    const token = jwt.sign({ id: data.id, role: data.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, utilisateur: { id: data.id, nom: data.nom, email: data.email, role: data.role } });
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

// Produits
app.get('/api/produits', async (req, res) => {
  try {
    const { data, error } = await supabase.from('produits').select('*');
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.json([]);
  }
});

app.listen(PORT, () => console.log(`✅ Serveur opérationnel sur le port ${PORT}`));