import { CAMPS, ROLES, campDe, role, roleExiste } from "../../public/js/partage/roles.js";

/**
 * Composition d'une partie et tirage des roles.
 *
 * Une composition est un objet { idRole: nombre }. Le maitre du jeu la compose
 * lui-meme dans son tableau de bord ; `compositionAutomatique` ne sert que de
 * point de depart.
 */

/**
 * Nombre de loups conseille selon la taille du village.
 * Un loup pour environ quatre joueurs, ce qui est l'equilibre habituel.
 */
function nombreDeLoups(nbJoueurs) {
    if (nbJoueurs >= 13) return 4;
    if (nbJoueurs >= 10) return 3;
    if (nbJoueurs >= 6) return 2;
    return 1;
}

/** Roles speciaux ajoutes au fur et a mesure que le village grandit. */
const SEUILS_SPECIAUX = [
    { id: "voyante", aPartirDe: 4 },
    { id: "sorciere", aPartirDe: 5 },
    { id: "chasseur", aPartirDe: 6 },
    { id: "cupidon", aPartirDe: 7 },
    { id: "petite-fille", aPartirDe: 8 },
];

export function compositionAutomatique(nbJoueurs) {
    const composition = { "loup-garou": nombreDeLoups(nbJoueurs) };
    let places = nbJoueurs - composition["loup-garou"];

    for (const { id, aPartirDe } of SEUILS_SPECIAUX) {
        if (nbJoueurs >= aPartirDe && places > 0) {
            composition[id] = 1;
            places -= 1;
        }
    }

    if (places > 0) composition.villageois = places;
    return composition;
}

export function totalComposition(composition) {
    return Object.values(composition).reduce((somme, n) => somme + n, 0);
}

/**
 * Verifie qu'une composition est jouable pour un nombre de joueurs donne.
 * Retourne la liste des problemes ; vide = composition valable.
 */
export function validerComposition(composition, nbJoueurs) {
    const erreurs = [];

    for (const [id, nombre] of Object.entries(composition)) {
        if (!roleExiste(id)) {
            erreurs.push(`Rôle inconnu : ${id}.`);
            continue;
        }
        if (!Number.isInteger(nombre) || nombre < 0) {
            erreurs.push(`Le nombre de ${id} doit être un entier positif.`);
            continue;
        }
        if (nombre > 1 && role(id).unique) {
            erreurs.push(`Il ne peut y avoir qu'un seul ${role(id).nom}.`);
        }
    }

    const total = totalComposition(composition);
    if (total !== nbJoueurs) {
        erreurs.push(
            `La composition compte ${total} rôle${total > 1 ? "s" : ""} pour ${nbJoueurs} joueur${nbJoueurs > 1 ? "s" : ""}.`
        );
    }

    const loups = Object.entries(composition)
        .filter(([id]) => roleExiste(id) && campDe(id) === CAMPS.LOUPS)
        .reduce((somme, [, n]) => somme + n, 0);

    if (loups < 1) erreurs.push("Il faut au moins un loup-garou.");
    if (loups >= total - loups) erreurs.push("Les loups ne peuvent pas être aussi nombreux que le village : la partie serait finie d'entrée.");

    return erreurs;
}

/**
 * Melange de Fisher-Yates. `alea` est injectable pour rendre les tests
 * reproductibles ; par defaut c'est Math.random.
 */
export function melanger(tableau, alea = Math.random) {
    const copie = [...tableau];
    for (let i = copie.length - 1; i > 0; i -= 1) {
        const j = Math.floor(alea() * (i + 1));
        [copie[i], copie[j]] = [copie[j], copie[i]];
    }
    return copie;
}

/** Developpe une composition en une liste de roles melangee. */
export function tirerRoles(composition, alea = Math.random) {
    const pioche = [];
    for (const [id, nombre] of Object.entries(composition)) {
        for (let i = 0; i < nombre; i += 1) pioche.push(id);
    }
    return melanger(pioche, alea);
}

/** Catalogue allege pour le composeur du maitre du jeu. */
export function rolesDisponibles() {
    return ROLES.map((r) => ({
        id: r.id,
        nom: r.nom,
        icone: r.icone,
        camp: r.camp,
        unique: Boolean(r.unique),
        accroche: r.accroche,
    }));
}
