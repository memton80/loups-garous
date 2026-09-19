import { randomUUID } from "node:crypto";

import { CAMPS, campDe } from "../../public/js/partage/roles.js";

/**
 * Etat d'une partie et acces de lecture.
 *
 * Aucune fonction de ce fichier ne connait socket.io : une partie est un objet
 * ordinaire que l'on peut construire et inspecter dans un test.
 */

export const PHASES = {
    ATTENTE: "attente",
    NUIT: "nuit",
    JOUR: "jour",
    TERMINEE: "terminee",
};

export const CAUSES = {
    LOUPS: "loups",
    POISON: "poison",
    VOTE: "vote",
    CHAGRIN: "chagrin",
    CHASSEUR: "chasseur",
    MJ: "mj",
};

/** Pseudo accepte : 2 a 20 caracteres, lettres, chiffres, espace, tiret, apostrophe. */
const PSEUDO_VALIDE = /^[\p{L}\p{N} '\-]{2,20}$/u;

export function pseudoValide(pseudo) {
    return typeof pseudo === "string" && PSEUDO_VALIDE.test(pseudo.trim());
}

export function creerPartie(code) {
    return {
        code,
        phase: PHASES.ATTENTE,
        tour: 0,

        /** Map<idJoueur, joueur> — l'ordre d'insertion est l'ordre d'arrivee. */
        joueurs: new Map(),

        /** Composition choisie par le maitre du jeu, posee au lancement. */
        composition: null,

        // --- Deroulement de la nuit ---
        etapes: [],
        indexEtape: -1,

        // --- Choix de la nuit en cours ---
        votesLoups: new Map(),
        cibleLoups: null,
        loupsIndecis: false,
        voyanteAJoue: false,
        sorciereAJoue: false,
        actionsSorciere: { antidote: false, ciblePoison: null },
        potions: { vie: true, mort: true },

        // --- Jour ---
        votesVillage: new Map(),

        // --- Liens et etats ---
        amoureux: null,

        // --- Resolution ---
        fileMorts: [],
        enAttente: null,
        suiteResolution: null,

        gagnant: null,
        historique: [],
        creeLe: Date.now(),
        termineeLe: null,
    };
}

export function ajouterJoueur(partie, pseudo) {
    const joueur = {
        id: randomUUID(),
        pseudo: pseudo.trim(),
        jeton: randomUUID(),
        role: null,
        vivant: true,
        connecte: true,
        socketId: null,
    };
    partie.joueurs.set(joueur.id, joueur);
    return joueur;
}

export function retirerJoueur(partie, joueurId) {
    const joueur = partie.joueurs.get(joueurId);
    if (!joueur) return false;
    partie.joueurs.delete(joueurId);
    partie.votesVillage.delete(joueurId);
    partie.votesLoups.delete(joueurId);
    if (partie.amoureux?.includes(joueurId)) partie.amoureux = null;
    return true;
}

export function joueur(partie, joueurId) {
    return partie.joueurs.get(joueurId) ?? null;
}

export function joueurParJeton(partie, jeton) {
    if (!jeton) return null;
    for (const j of partie.joueurs.values()) {
        if (j.jeton === jeton) return j;
    }
    return null;
}

export function pseudoDejaPris(partie, pseudo) {
    const cherche = pseudo.trim().toLocaleLowerCase("fr");
    for (const j of partie.joueurs.values()) {
        if (j.pseudo.toLocaleLowerCase("fr") === cherche) return true;
    }
    return false;
}

export function tousLesJoueurs(partie) {
    return [...partie.joueurs.values()];
}

export function joueursVivants(partie) {
    return tousLesJoueurs(partie).filter((j) => j.vivant);
}

export function joueursDuRole(partie, roleId, { vivantsSeulement = true } = {}) {
    return tousLesJoueurs(partie).filter(
        (j) => j.role === roleId && (!vivantsSeulement || j.vivant)
    );
}

export function loupsVivants(partie) {
    return joueursVivants(partie).filter((j) => campDe(j.role) === CAMPS.LOUPS);
}

export function estVivant(partie, joueurId) {
    return partie.joueurs.get(joueurId)?.vivant === true;
}

/**
 * Vue transmise a tout le monde : jamais le role d'un joueur vivant.
 * Le role d'un mort est revele, c'est la regle du jeu.
 */
export function vuePublique(partie) {
    return {
        code: partie.code,
        phase: partie.phase,
        tour: partie.tour,
        etape: etapeCouranteId(partie),
        enAttente: partie.enAttente ? partie.enAttente.type : null,
        gagnant: partie.gagnant,
        joueurs: tousLesJoueurs(partie).map((j) => ({
            id: j.id,
            pseudo: j.pseudo,
            vivant: j.vivant,
            connecte: j.connecte,
            role: j.vivant ? null : j.role,
        })),
    };
}

/**
 * Vue reservee au maitre du jeu : tous les roles, y compris ceux des vivants.
 */
export function vueMaitreDuJeu(partie) {
    return {
        ...vuePublique(partie),
        composition: partie.composition,
        potions: { ...partie.potions },
        amoureux: partie.amoureux ? [...partie.amoureux] : null,
        cibleLoups: partie.cibleLoups,
        etapes: partie.etapes.map((e) => ({ ...e })),
        indexEtape: partie.indexEtape,
        attente: partie.enAttente ? { ...partie.enAttente } : null,
        joueurs: tousLesJoueurs(partie).map((j) => ({
            id: j.id,
            pseudo: j.pseudo,
            vivant: j.vivant,
            connecte: j.connecte,
            role: j.role,
            aVoteVillage: partie.votesVillage.has(j.id),
            aVoteLoup: partie.votesLoups.has(j.id),
        })),
    };
}

export function etapeCourante(partie) {
    if (partie.indexEtape < 0) return null;
    return partie.etapes[partie.indexEtape] ?? null;
}

export function etapeCouranteId(partie) {
    return etapeCourante(partie)?.id ?? null;
}
