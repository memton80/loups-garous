import { ajouterJoueur, creerPartie, etapeCourante } from "../src/game/partie.js";
import { avancer, demarrerNuit } from "../src/game/moteur.js";

/**
 * Outils communs aux tests : ils permettent de poser une partie dans un etat
 * precis sans passer par le tirage aleatoire des roles.
 */

/**
 * Cree une partie dont les joueurs ont exactement les roles demandes, puis
 * ouvre la premiere nuit. Les joueurs sont nommes J1, J2, …
 */
export function preparerPartie(roles, { ouvrir = true } = {}) {
    const partie = creerPartie("TEST");
    roles.forEach((roleId, index) => {
        const joueur = ajouterJoueur(partie, `J${index + 1}`);
        joueur.role = roleId;
    });
    if (ouvrir) demarrerNuit(partie);
    return partie;
}

/** Les joueurs dans leur ordre d'arrivee. */
export function joueurs(partie) {
    return [...partie.joueurs.values()];
}

/** Le premier joueur portant ce role. */
export function parRole(partie, roleId) {
    return joueurs(partie).find((j) => j.role === roleId);
}

/** Tous les joueurs portant ce role. */
export function tousParRole(partie, roleId) {
    return joueurs(partie).filter((j) => j.role === roleId);
}

/**
 * Fait avancer la nuit jusqu'a l'etape demandee.
 * Leve une erreur plutot que de depasser : un test qui rate sa cible doit
 * echouer bruyamment.
 */
export function allerA(partie, etapeId) {
    for (let garde = 0; garde < 10; garde += 1) {
        if (etapeCourante(partie)?.id === etapeId) return partie;
        const resultat = avancer(partie);
        if (!resultat.ok) throw new Error(`Impossible d'atteindre l'etape ${etapeId} : ${resultat.erreur}`);
    }
    throw new Error(`Etape ${etapeId} jamais atteinte.`);
}

/** Tous les evenements d'un type donne dans une liste. */
export function evenementsDeType(evenements, type) {
    return evenements.filter((e) => e.type === type);
}

/** Le premier evenement d'un type donne, ou undefined. */
export function premierEvenement(evenements, type) {
    return evenements.find((e) => e.type === type);
}

/** Un generateur pseudo-aleatoire deterministe, pour les tirages reproductibles. */
export function aleaFixe(graine = 42) {
    let etat = graine;
    return () => {
        etat = (etat * 1103515245 + 12345) % 2147483648;
        return etat / 2147483648;
    };
}
