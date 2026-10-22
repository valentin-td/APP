// routes_partners.js
const express = require('express');
const router = express.Router();
const { Pool } = require('pg'); 

// On recrée la connexion à la BDD spécifiquement pour ce module
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT
});

router.get('/ping', (req, res) => {
    res.json({ message: "Le backend Stack Partners est en ligne et connecté !" });
});

module.exports = router;
