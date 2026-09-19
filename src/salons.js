import { creerPartie } from "./game/partie.js";

/**
 * Registre des parties en cours.
 *
 * L'etat vivant reste en memoire : a l'echelle d'une soiree (une poignee de
 * parties, une quinzaine de joueurs) c'est instantane. La base SQLite archive
 * en parallele, pour l'historique et la reprise apres un redemarrage.
 */

/** Alphabet sans caracteres ambigus : ni O/0, ni I/1, ni B/8. */
const ALPHABET = "ACDEFGHJKLMNPQRSTUVWXYZ23456789";
const LONGUEUR_CODE = 4;

const parties = new Map();

export function normaliserCode(code) {
    return String(code ?? "").trim().toUpperCase();
}

function codeLibre() {
    for (let essai = 0; essai < 200; essai += 1) {
        let code = "";
        for (let i = 0; i < LONGUEUR_CODE; i += 1) {
            code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
        }
        if (!parties.has(code)) return code;
    }
    // Quasi impossible avec 31^4 combinaisons, mais on ne boucle pas a l'infini.
    throw new Error("Impossible de generer un code de partie libre.");
}

export function creerSalon(codeDemande = null) {
    const code = codeDemande ? normaliserCode(codeDemande) : codeLibre();
    if (parties.has(code)) return { ok: false, erreur: "Ce code est deja utilise." };
    if (!/^[A-Z0-9]{3,6}$/.test(code)) {
        return { ok: false, erreur: "Le code doit faire 3 a 6 lettres ou chiffres." };
    }

    const partie = creerPartie(code);
    parties.set(code, partie);
    return { ok: true, partie };
}

export function salon(code) {
    return parties.get(normaliserCode(code)) ?? null;
}

export function supprimerSalon(code) {
    return parties.delete(normaliserCode(code));
}

export function tousLesSalons() {
    return [...parties.values()];
}

/** Remet le registre a zero — utilise par les tests. */
export function viderSalons() {
    parties.clear();
}

export const salleJoueurs = (code) => `partie:${code}`;
export const salleSpectateurs = (code) => `spectateurs:${code}`;
export const SALLE_MJ = "maitres-du-jeu";
