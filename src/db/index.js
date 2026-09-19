import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import { PHASES, deserialiserPartie, serialiserPartie, tousLesJoueurs } from "../game/partie.js";

/**
 * Archivage des parties.
 *
 * L'etat vivant reste en memoire : a l'echelle d'une soiree, tout est
 * instantane. La base sert deux besoins du cahier des charges que l'ancienne
 * version ne couvrait pas du tout :
 *
 *   - l'historique des actions, rejouable apres coup ;
 *   - la reprise d'une partie interrompue par un redemarrage du serveur.
 *
 * Tant que `ouvrirBase` n'a pas ete appelee, toutes les fonctions ne font
 * rien : les tests du moteur tournent ainsi sans toucher au disque.
 */

const DOSSIER = dirname(fileURLToPath(import.meta.url));

let base = null;
let requetes = null;

export function ouvrirBase(chemin) {
    if (base) return base;

    if (chemin !== ":memory:") mkdirSync(dirname(chemin), { recursive: true });

    base = new Database(chemin);
    base.pragma("journal_mode = WAL");
    base.pragma("foreign_keys = ON");
    base.exec(readFileSync(resolve(DOSSIER, "schema.sql"), "utf8"));

    requetes = {
        enregistrerPartie: base.prepare(`
            INSERT INTO parties (code, creee_le, terminee_le, phase, tour, gagnant, composition, etat)
            VALUES (@code, @creee_le, @terminee_le, @phase, @tour, @gagnant, @composition, @etat)
            ON CONFLICT(code) DO UPDATE SET
                terminee_le = excluded.terminee_le,
                phase       = excluded.phase,
                tour        = excluded.tour,
                gagnant     = excluded.gagnant,
                composition = excluded.composition,
                etat        = excluded.etat
        `),
        enregistrerJoueur: base.prepare(`
            INSERT INTO joueurs (id, code_partie, pseudo, jeton, role, vivant, arrive_le)
            VALUES (@id, @code_partie, @pseudo, @jeton, @role, @vivant, @arrive_le)
            ON CONFLICT(id) DO UPDATE SET
                pseudo = excluded.pseudo,
                role   = excluded.role,
                vivant = excluded.vivant
        `),
        ajouterEvenement: base.prepare(`
            INSERT INTO evenements (code_partie, tour, type, visibilite, donnees, horodatage)
            VALUES (@code_partie, @tour, @type, @visibilite, @donnees, @horodatage)
        `),
        supprimerPartie: base.prepare("DELETE FROM parties WHERE code = ?"),
        partiesEnCours: base.prepare("SELECT etat FROM parties WHERE terminee_le IS NULL"),
        partiesTerminees: base.prepare(`
            SELECT p.code, p.creee_le, p.terminee_le, p.tour, p.gagnant, p.composition,
                   (SELECT COUNT(*) FROM joueurs j WHERE j.code_partie = p.code) AS nombre_joueurs
            FROM parties p
            WHERE p.terminee_le IS NOT NULL
            ORDER BY p.terminee_le DESC
            LIMIT ?
        `),
        joueursDe: base.prepare(
            "SELECT id, pseudo, role, vivant FROM joueurs WHERE code_partie = ? ORDER BY arrive_le"
        ),
        evenementsDe: base.prepare(
            "SELECT tour, type, visibilite, donnees, horodatage FROM evenements WHERE code_partie = ? ORDER BY id"
        ),
        unePartie: base.prepare("SELECT code, creee_le, terminee_le, tour, gagnant, composition FROM parties WHERE code = ?"),
    };

    return base;
}

export function fermerBase() {
    base?.close();
    base = null;
    requetes = null;
}

export function baseOuverte() {
    return base !== null;
}

/** Ecrit l'etat complet de la partie. Appelee a chaque changement. */
export function enregistrerPartie(partie) {
    if (!requetes) return;

    requetes.enregistrerPartie.run({
        code: partie.code,
        creee_le: partie.creeLe,
        terminee_le: partie.phase === PHASES.TERMINEE ? partie.termineeLe ?? Date.now() : null,
        phase: partie.phase,
        tour: partie.tour,
        gagnant: partie.gagnant,
        composition: partie.composition ? JSON.stringify(partie.composition) : null,
        etat: serialiserPartie(partie),
    });

    for (const joueur of tousLesJoueurs(partie)) enregistrerJoueur(partie, joueur);
}

export function enregistrerJoueur(partie, joueur) {
    if (!requetes) return;
    requetes.enregistrerJoueur.run({
        id: joueur.id,
        code_partie: partie.code,
        pseudo: joueur.pseudo,
        jeton: joueur.jeton,
        role: joueur.role,
        vivant: joueur.vivant ? 1 : 0,
        arrive_le: Date.now(),
    });
}

/** Ajoute les evenements au deroule de la partie. */
export function archiverEvenements(partie, evenements = []) {
    if (!requetes || evenements.length === 0) return;

    const ecrire = base.transaction((liste) => {
        for (const evenement of liste) {
            const { type, visibilite, tour, horodatage, ...donnees } = evenement;
            requetes.ajouterEvenement.run({
                code_partie: partie.code,
                tour: tour ?? partie.tour,
                type,
                visibilite: visibilite ?? "publique",
                donnees: JSON.stringify(donnees),
                horodatage: horodatage ?? Date.now(),
            });
        }
    });

    ecrire(evenements);
}

export function oublierPartie(code) {
    requetes?.supprimerPartie.run(code);
}

/**
 * Parties encore en cours au dernier arret du serveur : elles sont rechargees
 * telles quelles, chaque joueur retrouvant sa place avec son jeton.
 */
export function partiesAReprendre() {
    if (!requetes) return [];
    return requetes.partiesEnCours
        .all()
        .map((ligne) => {
            try {
                return deserialiserPartie(ligne.etat);
            } catch {
                return null; // un enregistrement illisible ne doit pas bloquer le demarrage
            }
        })
        .filter(Boolean);
}

/** Liste des parties terminees, pour la page d'historique. */
export function partiesTerminees(limite = 50) {
    if (!requetes) return [];
    return requetes.partiesTerminees.all(limite).map((ligne) => ({
        code: ligne.code,
        creeeLe: ligne.creee_le,
        termineeLe: ligne.terminee_le,
        tours: ligne.tour,
        gagnant: ligne.gagnant,
        nombreJoueurs: ligne.nombre_joueurs,
        composition: ligne.composition ? JSON.parse(ligne.composition) : null,
    }));
}

/** Deroule complet d'une partie archivee, pour la rejouer. */
export function archiveDeLaPartie(code) {
    if (!requetes) return null;

    const partie = requetes.unePartie.get(code);
    if (!partie) return null;

    return {
        code: partie.code,
        creeeLe: partie.creee_le,
        termineeLe: partie.terminee_le,
        tours: partie.tour,
        gagnant: partie.gagnant,
        composition: partie.composition ? JSON.parse(partie.composition) : null,
        joueurs: requetes.joueursDe.all(code).map((ligne) => ({
            id: ligne.id,
            pseudo: ligne.pseudo,
            role: ligne.role,
            vivant: ligne.vivant === 1,
        })),
        evenements: requetes.evenementsDe.all(code).map((ligne) => ({
            tour: ligne.tour,
            type: ligne.type,
            visibilite: ligne.visibilite,
            horodatage: ligne.horodatage,
            ...JSON.parse(ligne.donnees),
        })),
    };
}
