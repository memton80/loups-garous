import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { config } from "../config.js";

/**
 * Authentification du maitre du jeu.
 *
 * Deux defauts de l'ancienne version sont corriges ici :
 *
 *  1. le serveur renvoyait au client un « secret » partage, identique pour
 *     tout le monde et valable indefiniment. On delivre desormais un jeton
 *     aleatoire par session, garde cote serveur, avec une date d'expiration.
 *
 *  2. un code a quatre chiffres se force en quelques minutes. Les tentatives
 *     sont comptees par adresse et l'attente grandit a chaque echec.
 */

/** Map<jeton, expiration en millisecondes> */
const sessions = new Map();

/** Map<adresse, { echecs, prochainEssai }> */
const tentatives = new Map();

/**
 * Attente imposee apres n echecs consecutifs. Les premiers essais restent
 * libres — on se trompe en tapant un code — puis la porte se ferme vite.
 */
const PALIERS = [0, 0, 0, 1_000, 5_000, 30_000, 300_000];

function attenteApres(echecs) {
    return PALIERS[Math.min(echecs, PALIERS.length - 1)];
}

/** Comparaison a temps constant, quelle que soit la longueur des entrees. */
function memeValeur(a, b) {
    const empreinteA = createHash("sha256").update(String(a)).digest();
    const empreinteB = createHash("sha256").update(String(b)).digest();
    return timingSafeEqual(empreinteA, empreinteB);
}

function purgerSessions() {
    const maintenant = Date.now();
    for (const [jeton, expiration] of sessions) {
        if (expiration <= maintenant) sessions.delete(jeton);
    }
}

/**
 * Verifie un code PIN. Retourne un jeton de session en cas de succes, ou le
 * nombre de secondes a patienter si l'adresse a trop echoue.
 */
export function verifierPin(adresse, pin) {
    const maintenant = Date.now();
    const suivi = tentatives.get(adresse) ?? { echecs: 0, prochainEssai: 0 };

    if (maintenant < suivi.prochainEssai) {
        return {
            ok: false,
            erreur: "Trop de tentatives. Patientez avant de reessayer.",
            attenteSecondes: Math.ceil((suivi.prochainEssai - maintenant) / 1000),
        };
    }

    if (!memeValeur(pin, config.adminPin)) {
        suivi.echecs += 1;
        suivi.prochainEssai = maintenant + attenteApres(suivi.echecs);
        tentatives.set(adresse, suivi);
        return {
            ok: false,
            erreur: "Code incorrect.",
            attenteSecondes: Math.ceil(attenteApres(suivi.echecs) / 1000),
        };
    }

    tentatives.delete(adresse);
    purgerSessions();

    const jeton = randomBytes(32).toString("hex");
    sessions.set(jeton, maintenant + config.dureeSessionMj);
    return { ok: true, jeton };
}

/** True si le jeton correspond a une session encore valable. */
export function sessionValide(jeton) {
    if (typeof jeton !== "string" || jeton.length === 0) return false;
    const expiration = sessions.get(jeton);
    if (!expiration) return false;
    if (expiration <= Date.now()) {
        sessions.delete(jeton);
        return false;
    }
    return true;
}

export function fermerSession(jeton) {
    sessions.delete(jeton);
}

/** Remet compteurs et sessions a zero — utilise par les tests. */
export function reinitialiserAuth() {
    sessions.clear();
    tentatives.clear();
}
