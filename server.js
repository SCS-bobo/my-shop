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

// Connexion Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Autoriser les accès et lire les données
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 📌 Servir les fichiers de ton site (index.html, CSS, JS...)
app.use(express.static(path.join(__dirname)));

// Multer : stockage temporaire en mémoire pour les images
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Middleware d'authentification
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

// 📌 Page d'accueil par défaut
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// --- Inscription / Connexion ---
app.post('/api/inscription', async (req, res) => {
  try {
    const { nom, email, telephone, motDePasse, role } = req.body;
    const motCrypte = await bcrypt.hash(motDePasse, 10);

    const { data, error } = await supabase
      .from('users')
      .insert([{ nom, email, telephone, mot_de_passe: motCrypte, role }])
      .select();

    if (error) return res.status(400).json({ erreur: 'Email déjà utilisé ou erreur : ' + error.message });

    const token = jwt.sign({ id: data[0].id, role: data[0].role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, utilisateur: { id: data[0].id, nom, email, role } });
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

app.post('/api/connexion', async (req, res) => {
  try {
    const { email, motDePasse } = req.body;

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !data) return res.status(400).json({ erreur: 'Identifiants incorrects' });

    const valide = await bcrypt.compare(motDePasse, data.mot_de_passe);
    if (!valide) return res.status(400).json({ erreur: 'Mot de passe faux' });

    const token = jwt.sign({ id: data.id, role: data.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, utilisateur: { id: data.id, nom: data.nom, email: data.email, role: data.role } });
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

// --- Produits avec stockage Supabase ---
app.get('/api/produits', async (req, res) => {
  const { data, error } = await supabase
    .from('produits')
    .select('*, vendeur:users(nom, telephone)');
  if (error) return res.status(500).json({ erreur: error.message });
  res.json(data);
});

app.post('/api/produits', auth, upload.single('image'), async (req, res) => {
  if (!['commercant', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ erreur: 'Seuls les commerçants peuvent ajouter des produits' });
  }

  const { nom, description, prix, stock, categorie } = req.body;
  let imageUrl = null;

  if (req.file) {
    const nomFichier = `${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`;
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('produits-images')
      .upload(nomFichier, req.file.buffer, {
        contentType: req.file.mimetype,
        cacheControl: '3600'
      });

    if (uploadError) return res.status(500).json({ erreur: 'Erreur upload image : ' + uploadError.message });

    const { data: { publicUrl } } = supabase
      .storage
      .from('produits-images')
      .getPublicUrl(nomFichier);

    imageUrl = publicUrl;
  }

  const { data, error } = await supabase
    .from('produits')
    .insert([{
      nom,
      description,
      prix: Number(prix),
      stock: Number(stock),
      categorie,
      image: imageUrl,
      vendeur_id: req.user.id
    }])
    .select();

  if (error) return res.status(400).json({ erreur: error.message });
  res.status(201).json(data[0]);
});

// --- Commandes & Paiements ---
app.post('/api/commander', auth, async (req, res) => {
  try {
    const { panier, montant_total, mode_paiement } = req.body;

    for (const article of panier) {
      const { data: produit } = await supabase.from('produits').select('stock').eq('id', article.id).single();
      if (!produit || produit.stock < article.quantite) {
        return res.status(400).json({ erreur: `Stock insuffisant pour ${article.nom}` });
      }
    }

    const numerosReception = {
      orange: process.env.ORANGE_MONEY_RECEIVER,
      mtn: process.env.MTN_MOMO_RECEIVER,
      wave: process.env.WAVE_RECEIVER
    };
    const numeroReception = numerosReception[mode_paiement];

    const { data: commande, error: errCmd } = await supabase
      .from('commandes')
      .insert([{
        client_id: req.user.id,
        montant_total: montant_total,
        mode_paiement,
        numero_reception: numeroReception,
        statut: 'en_attente'
      }])
      .select()
      .single();

    if (errCmd) throw errCmd;

    const lignes = panier.map(art => ({
      commande_id: commande.id,
      produit_id: art.id,
      quantite: art.quantite,
      prix_unitaire: art.prix
    }));

    const { error: errLignes } = await supabase.from('lignes_commande').insert(lignes);
    if (errLignes) throw errLignes;

    for (const art of panier) {
      await supabase.from('produits').update({ stock: supabase.raw('stock - ?', [art.quantite]) }).eq('id', art.id);
    }

    res.status(201).json({
      ok: true,
      commande_id: commande.id,
      numero_reception,
      message: `Veuillez envoyer ${montant_total.toLocaleString('fr-FR')} FCFA au ${numeroReception} via ${mode_paiement.toUpperCase()}`
    });

  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

app.get('/api/mes-commandes', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('commandes')
    .select('*')
    .eq('client_id', req.user.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ erreur: error.message });
  res.json(data);
});

// Lancer le serveur
app.listen(PORT, () => console.log(`✅ Serveur opérationnel sur le port ${PORT}`));