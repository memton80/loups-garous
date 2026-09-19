import { CAMPS, campDe } from "../../public/js/partage/roles.js";

import { joueursVivants } from "./partie.js";

export const CAMPS_VICTORIEUX = {
    VILLAGE: "village",
    LOUPS: "loups",
    AMOUREUX: "amoureux",
    PERSONNE: "personne",
};

/**
 * Determine si la partie est gagnee. Retourne null tant qu'elle continue.
 *
 * L'ordre des tests compte : la victoire des amoureux prime, car un couple
 * mixte qui reste seul gagne contre son propre camp.
 */
export function evaluerVictoire(partie) {
    const vivants = joueursVivants(partie);

    if (vivants.length === 0) {
        return {
            camp: CAMPS_VICTORIEUX.PERSONNE,
            message: "Le village s'est éteint. Personne ne gagne.",
        };
    }

    if (partie.amoureux && vivants.length === 2) {
        const idsVivants = new Set(vivants.map((j) => j.id));
        if (partie.amoureux.every((id) => idsVivants.has(id))) {
            const noms = partie.amoureux.map((id) => partie.joueurs.get(id).pseudo);
            return {
                camp: CAMPS_VICTORIEUX.AMOUREUX,
                message: `${noms[0]} et ${noms[1]} sont les derniers survivants : les amoureux gagnent ensemble.`,
            };
        }
    }

    const loups = vivants.filter((j) => campDe(j.role) === CAMPS.LOUPS);
    const village = vivants.filter((j) => campDe(j.role) !== CAMPS.LOUPS);

    if (loups.length === 0) {
        return {
            camp: CAMPS_VICTORIEUX.VILLAGE,
            message: "Tous les loups ont été éliminés : le village a gagné.",
        };
    }

    if (loups.length >= village.length) {
        return {
            camp: CAMPS_VICTORIEUX.LOUPS,
            message: "Les loups sont aussi nombreux que les villageois : ils ont gagné.",
        };
    }

    return null;
}
