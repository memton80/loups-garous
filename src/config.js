import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Configuration de l'application.
 *
 * Les valeurs viennent, par ordre de priorite :
 *   1. les variables d'environnement du processus
 *   2. le fichier .env a la racine du projet
 *   3. les valeurs par defaut ci-dessous
 *
 * On lit le .env nous-memes plutot que d'ajouter une dependance : le format
 * est volontairement minimal (CLE=valeur, # pour les commentaires).
 */

export const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function lireFichierEnv(chemin) {
    let contenu;
    try {
        contenu = readFileSync(chemin, "utf8");
    } catch {
        return {}; // pas de .env : on se contente des valeurs par defaut
    }

    const valeurs = {};
    for (const ligne of contenu.split("\n")) {
        const nettoyee = ligne.trim();
        if (!nettoyee || nettoyee.startsWith("#")) continue;
        const separateur = nettoyee.indexOf("=");
        if (separateur === -1) continue;
        const cle = nettoyee.slice(0, separateur).trim();
        const valeur = nettoyee.slice(separateur + 1).trim().replace(/^["']|["']$/g, "");
        if (cle) valeurs[cle] = valeur;
    }
    return valeurs;
}

const env = { ...lireFichierEnv(resolve(RACINE, ".env")), ...process.env };

function entier(valeur, defaut) {
    const n = Number.parseInt(valeur, 10);
    return Number.isFinite(n) ? n : defaut;
}

export const config = {
    port: entier(env.PORT, 3000),
    adminPin: String(env.ADMIN_PIN ?? "1234"),
    fichierBase: resolve(RACINE, env.DB_FILE ?? "./data/loups-garous.db"),
    dossierPublic: resolve(RACINE, "public"),

    // Nombre minimum de joueurs pour lancer une partie.
    joueursMinimum: 4,

    // Duree de validite d'une session du maitre du jeu (2 heures).
    dureeSessionMj: 2 * 60 * 60 * 1000,
};

// Garde-fou : un PIN par defaut en production, c'est une porte ouverte.
if (config.adminPin === "1234") {
    console.warn(
        "[config] ADMIN_PIN vaut encore la valeur par defaut 1234. " +
        "Copiez .env.example vers .env et changez-le avant une vraie partie."
    );
}
