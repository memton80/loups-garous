import {
    CAMPS,
    ETAPES_NUIT,
    ROLES_NOCTURNES,
    campDe,
    role,
    roleExiste,
} from "../../public/js/partage/roles.js";

import { tirerRoles, validerComposition } from "./distribution.js";
import {
    CAUSES,
    PHASES,
    etapeCourante,
    joueur,
    joueursDuRole,
    joueursVivants,
    loupsVivants,
    tousLesJoueurs,
} from "./partie.js";
import { evaluerVictoire } from "./victoire.js";

/**
 * Moteur de jeu.
 *
 * Aucune fonction ici ne connait socket.io ni la base de donnees : chaque
 * appel modifie l'etat de la partie et retourne une liste d'evenements. C'est
 * la couche socket qui decide a qui envoyer quoi, et la couche base qui les
 * archive. C'est ce qui permet de tester toutes les regles sans reseau.
 *
 * Toutes les fonctions publiques retournent la meme forme :
 *     { ok: true,  evenements: [...] }
 *     { ok: false, erreur: "…",  evenements: [] }
 */

// ─── Fabrique d'evenements ───────────────────────────────────────

function evenementPublic(type, donnees = {}) {
    return { type, visibilite: "publique", ...donnees };
}

function evenementPrive(type, destinataires, donnees = {}) {
    return { type, visibilite: "privee", destinataires, ...donnees };
}

function echec(erreur) {
    return { ok: false, erreur, evenements: [] };
}

function succes(partie, evenements) {
    for (const evenement of evenements) {
        partie.historique.push({ ...evenement, tour: partie.tour, horodatage: Date.now() });
    }
    return { ok: true, evenements };
}

// ─── Lancement ───────────────────────────────────────────────────

/**
 * Distribue les roles et ouvre la premiere nuit.
 * `alea` est injectable pour rendre les tests reproductibles.
 */
export function lancerPartie(partie, composition, alea = Math.random) {
    if (partie.phase !== PHASES.ATTENTE) {
        return echec("La partie est deja lancee.");
    }

    const joueurs = tousLesJoueurs(partie);
    const erreurs = validerComposition(composition, joueurs.length);
    if (erreurs.length > 0) return echec(erreurs.join(" "));

    const tirage = tirerRoles(composition, alea);
    joueurs.forEach((j, index) => {
        j.role = tirage[index];
        j.vivant = true;
    });

    partie.composition = { ...composition };

    const evenements = joueurs.map((j) =>
        evenementPrive("role-attribue", [j.id], { joueurId: j.id, role: j.role })
    );

    evenements.push(...presenterLaMeute(partie));
    evenements.push(...ouvrirNuit(partie));

    return succes(partie, evenements);
}

/** Chaque loup apprend qui sont ses congeneres. */
function presenterLaMeute(partie) {
    const loups = loupsVivants(partie);
    if (loups.length === 0) return [];
    const identites = loups.map((l) => ({ id: l.id, pseudo: l.pseudo }));
    return [
        evenementPrive("meute", loups.map((l) => l.id), { loups: identites }),
    ];
}

// ─── Nuit ────────────────────────────────────────────────────────

/**
 * Construit la liste des etapes de la nuit a partir des roles encore vivants,
 * dans l'ordre ou le maitre du jeu les appelle a voix haute.
 */
function construireEtapes(partie) {
    const etapes = [];

    for (const fiche of ROLES_NOCTURNES) {
        if (fiche.premiereNuitSeulement && partie.tour !== 1) continue;
        // Cupidon n'agit qu'une fois : si le couple existe deja, on l'ignore.
        if (fiche.id === "cupidon" && partie.amoureux) continue;

        const acteurs = joueursDuRole(partie, fiche.id);
        if (acteurs.length === 0) continue;

        etapes.push({
            id: fiche.etapeNuit,
            role: fiche.id,
            acteurs: acteurs.map((j) => j.id),
            // Les roles qui epient la meute se reveillent pendant son tour.
            espions:
                fiche.etapeNuit === ETAPES_NUIT.LOUPS
                    ? joueursVivants(partie)
                          .filter((j) => role(j.role)?.epieLesLoups)
                          .map((j) => j.id)
                    : [],
            termine: false,
        });
    }

    return etapes;
}

function ouvrirNuit(partie) {
    partie.tour += 1;
    partie.phase = PHASES.NUIT;

    partie.votesLoups.clear();
    partie.votesVillage.clear();
    partie.cibleLoups = null;
    partie.loupsIndecis = false;
    partie.voyanteAJoue = false;
    partie.sorciereAJoue = false;
    partie.actionsSorciere = { antidote: false, ciblePoison: null };

    partie.etapes = construireEtapes(partie);
    partie.indexEtape = -1;

    const evenements = [evenementPublic("phase", { phase: PHASES.NUIT, tour: partie.tour })];
    evenements.push(...entrerEtapeSuivante(partie));
    return evenements;
}

/** Passe a l'etape suivante, ou resout la nuit s'il n'en reste plus. */
function entrerEtapeSuivante(partie) {
    partie.indexEtape += 1;

    const etape = etapeCourante(partie);
    if (!etape) return resoudreNuit(partie);

    // L'annonce de l'etape est publique — le maitre du jeu appelle les roles a
    // voix haute, tout le monde l'entend. Mais l'identite de ceux qui se
    // reveillent reste secrete : elle ne part qu'a eux.
    const evenements = [evenementPublic("etape", { etape: etape.id, role: etape.role })];

    if (etape.acteurs.length > 0) {
        evenements.push(
            evenementPrive("votre-tour", etape.acteurs, { etape: etape.id, role: etape.role })
        );
    }
    if (etape.espions.length > 0) {
        evenements.push(evenementPrive("espionner", etape.espions, { etape: etape.id }));
    }

    return evenements;
}

/** Cloture l'etape en cours ; seuls les loups ont un decompte a faire. */
function terminerEtapeCourante(partie) {
    const etape = etapeCourante(partie);
    if (!etape) return [];
    etape.termine = true;
    if (etape.id === ETAPES_NUIT.LOUPS) return calculerCibleLoups(partie);
    return [];
}

/**
 * Depouille le vote des loups. En cas d'egalite, la meute ne mange personne :
 * le maitre du jeu peut leur demander de revoter avant de passer a la suite.
 */
function calculerCibleLoups(partie) {
    partie.cibleLoups = null;
    partie.loupsIndecis = false;

    const comptes = compter(partie.votesLoups);
    if (comptes.length === 0) return [];

    if (comptes.length > 1 && comptes[0][1] === comptes[1][1]) {
        partie.loupsIndecis = true;
        return [evenementPrive("loups-indecis", loupsVivants(partie).map((l) => l.id))];
    }

    partie.cibleLoups = comptes[0][0];
    return [];
}

/** Applique les morts de la nuit puis enchaine sur le jour. */
function resoudreNuit(partie) {
    const evenements = [];
    const { antidote, ciblePoison } = partie.actionsSorciere;

    if (partie.cibleLoups && !antidote) {
        partie.fileMorts.push({ joueurId: partie.cibleLoups, cause: CAUSES.LOUPS });
    }
    if (ciblePoison) {
        partie.fileMorts.push({ joueurId: ciblePoison, cause: CAUSES.POISON });
    }

    // Personne ne doit apprendre qu'un sauvetage a eu lieu, ni qui en a
    // beneficie : de l'exterieur, une nuit sans mort ressemble a une nuit calme.
    if (partie.fileMorts.length === 0) {
        evenements.push(evenementPublic("aucune-mort"));
    }

    partie.suiteResolution = "ouvrir-jour";
    evenements.push(...continuerResolution(partie));
    return evenements;
}

/**
 * Ouvre la premiere nuit sur une partie dont les roles sont deja poses.
 * Seul point d'entree public : il archive les evenements, contrairement aux
 * fonctions internes qui se contentent de les rendre.
 */
export function demarrerNuit(partie) {
    return succes(partie, ouvrirNuit(partie));
}

// ─── Jour ────────────────────────────────────────────────────────

function ouvrirJour(partie) {
    partie.phase = PHASES.JOUR;
    partie.votesVillage.clear();
    partie.etapes = [];
    partie.indexEtape = -1;
    return [evenementPublic("phase", { phase: PHASES.JOUR, tour: partie.tour })];
}

function resoudreVote(partie) {
    const evenements = [];
    const comptes = compter(partie.votesVillage);

    if (comptes.length === 0) {
        evenements.push(evenementPublic("vote-resolu", { elimineId: null, motif: "aucun-vote", comptes }));
    } else if (comptes.length > 1 && comptes[0][1] === comptes[1][1]) {
        evenements.push(evenementPublic("vote-resolu", { elimineId: null, motif: "egalite", comptes }));
    } else {
        const elimineId = comptes[0][0];
        evenements.push(
            evenementPublic("vote-resolu", {
                elimineId,
                pseudo: joueur(partie, elimineId)?.pseudo ?? null,
                motif: "elimine",
                comptes,
            })
        );
        partie.fileMorts.push({ joueurId: elimineId, cause: CAUSES.VOTE });
    }

    partie.suiteResolution = "ouvrir-nuit";
    evenements.push(...continuerResolution(partie));
    return evenements;
}

// ─── Bouton « Suivant » du maitre du jeu ─────────────────────────

/**
 * Fait avancer la partie d'un cran. C'est le seul rythme du jeu : il n'y a
 * aucun minuteur, le maitre du jeu mene la partie a la voix comme a une table.
 *
 * `forcer` permet d'abandonner une attente bloquee (chasseur absent de l'appli).
 */
export function avancer(partie, { forcer = false } = {}) {
    if (partie.phase === PHASES.TERMINEE) return echec("La partie est terminee.");
    if (partie.phase === PHASES.ATTENTE) return echec("La partie n'est pas lancee.");

    if (partie.enAttente) {
        if (!forcer) {
            return echec("Une action est en attente. Utilisez « passer » pour l'abandonner.");
        }
        partie.enAttente = null;
        return succes(partie, continuerResolution(partie));
    }

    if (partie.phase === PHASES.NUIT) {
        const evenements = terminerEtapeCourante(partie);
        evenements.push(...entrerEtapeSuivante(partie));
        return succes(partie, evenements);
    }

    return succes(partie, resoudreVote(partie));
}

// ─── Morts, cascades et fin de partie ────────────────────────────

/**
 * Vide la file des morts. S'arrete des qu'une action est attendue — le tir du
 * chasseur — et reprend la ou elle s'etait arretee une fois l'action jouee.
 */
function traiterFileMorts(partie) {
    const evenements = [];

    while (partie.fileMorts.length > 0 && !partie.enAttente) {
        const { joueurId, cause } = partie.fileMorts.shift();
        const mort = joueur(partie, joueurId);
        if (!mort || !mort.vivant) continue;

        mort.vivant = false;
        evenements.push(
            evenementPublic("mort", {
                joueurId,
                pseudo: mort.pseudo,
                role: mort.role,
                cause,
            })
        );

        // L'amour ne survit pas a la mort de l'autre.
        if (partie.amoureux?.includes(joueurId)) {
            const partenaireId = partie.amoureux.find((id) => id !== joueurId);
            if (joueur(partie, partenaireId)?.vivant) {
                partie.fileMorts.push({ joueurId: partenaireId, cause: CAUSES.CHAGRIN });
            }
        }

        // Le chasseur tire avant que quoi que ce soit d'autre ne se resolve.
        if (role(mort.role)?.tireEnMourant && joueursVivants(partie).length > 0) {
            partie.enAttente = { type: "chasseur", joueurId };
            evenements.push(
                evenementPublic("attente", {
                    attente: "chasseur",
                    joueurId,
                    pseudo: mort.pseudo,
                })
            );
        }
    }

    return evenements;
}

/**
 * Enchaine : morts en attente → verification de la victoire → phase suivante.
 * Appelee apres chaque evenement susceptible de tuer quelqu'un.
 */
function continuerResolution(partie) {
    const evenements = traiterFileMorts(partie);

    // Une action est attendue : la partie reprendra quand elle sera jouee.
    if (partie.enAttente) return evenements;

    const victoire = evaluerVictoire(partie);
    if (victoire) {
        partie.phase = PHASES.TERMINEE;
        partie.gagnant = victoire.camp;
        partie.termineeLe = Date.now();
        partie.etapes = [];
        partie.indexEtape = -1;
        partie.suiteResolution = null;
        evenements.push(
            evenementPublic("victoire", {
                camp: victoire.camp,
                message: victoire.message,
                revelations: tousLesJoueurs(partie).map((j) => ({
                    id: j.id,
                    pseudo: j.pseudo,
                    role: j.role,
                    vivant: j.vivant,
                })),
            })
        );
        return evenements;
    }

    const suite = partie.suiteResolution;
    partie.suiteResolution = null;

    if (suite === "ouvrir-jour") evenements.push(...ouvrirJour(partie));
    else if (suite === "ouvrir-nuit") evenements.push(...ouvrirNuit(partie));

    return evenements;
}

// ─── Actions des joueurs ─────────────────────────────────────────

/** Verifie qu'un joueur vivant du bon role agit bien pendant son etape. */
function verifierActeur(partie, joueurId, roleAttendu, etapeAttendue) {
    if (partie.phase !== PHASES.NUIT) return "Ce n'est pas la nuit.";
    const acteur = joueur(partie, joueurId);
    if (!acteur) return "Joueur inconnu.";
    if (!acteur.vivant) return "Les morts n'agissent plus.";
    if (acteur.role !== roleAttendu) return "Ce n'est pas votre role.";
    if (etapeCourante(partie)?.id !== etapeAttendue) return "Ce n'est pas votre tour.";
    return null;
}

export function voterLoup(partie, joueurId, cibleId) {
    if (partie.phase !== PHASES.NUIT) return echec("Ce n'est pas la nuit.");
    const loup = joueur(partie, joueurId);
    if (!loup?.vivant) return echec("Les morts ne votent plus.");
    if (campDe(loup.role) !== CAMPS.LOUPS) return echec("Ce n'est pas votre role.");
    if (etapeCourante(partie)?.id !== ETAPES_NUIT.LOUPS) return echec("Ce n'est pas votre tour.");

    const cible = joueur(partie, cibleId);
    if (!cible?.vivant) return echec("Cette cible n'est plus en vie.");
    if (campDe(cible.role) === CAMPS.LOUPS) return echec("Les loups ne se devorent pas entre eux.");

    partie.votesLoups.set(joueurId, cibleId);

    const idsLoups = loupsVivants(partie).map((l) => l.id);
    return succes(partie, [
        evenementPrive("votes-loups", idsLoups, {
            comptes: compter(partie.votesLoups),
            votants: [...partie.votesLoups.keys()],
            total: idsLoups.length,
        }),
    ]);
}

export function actionVoyante(partie, joueurId, cibleId) {
    const erreur = verifierActeur(partie, joueurId, "voyante", ETAPES_NUIT.VOYANTE);
    if (erreur) return echec(erreur);
    if (partie.voyanteAJoue) return echec("Vous avez deja consulte cette nuit.");

    const cible = joueur(partie, cibleId);
    if (!cible?.vivant) return echec("Cette cible n'est plus en vie.");
    if (cibleId === joueurId) return echec("Inutile de vous consulter vous-meme.");

    partie.voyanteAJoue = true;

    return succes(partie, [
        evenementPrive("voyante-resultat", [joueurId], {
            cibleId,
            pseudo: cible.pseudo,
            role: cible.role,
        }),
    ]);
}

export function actionSorciere(partie, joueurId, { antidote = false, ciblePoison = null } = {}) {
    const erreur = verifierActeur(partie, joueurId, "sorciere", ETAPES_NUIT.SORCIERE);
    if (erreur) return echec(erreur);
    if (partie.sorciereAJoue) return echec("Vous avez deja agi cette nuit.");

    if (antidote) {
        if (!partie.potions.vie) return echec("Votre antidote est deja consomme.");
        if (!partie.cibleLoups) return echec("Il n'y a personne a sauver cette nuit.");
    }

    if (ciblePoison) {
        if (!partie.potions.mort) return echec("Votre poison est deja consomme.");
        const cible = joueur(partie, ciblePoison);
        if (!cible?.vivant) return echec("Cette cible n'est plus en vie.");
        if (ciblePoison === partie.cibleLoups) {
            return echec("Les loups s'occupent deja de cette personne.");
        }
    }

    if (antidote) partie.potions.vie = false;
    if (ciblePoison) partie.potions.mort = false;

    partie.sorciereAJoue = true;
    partie.actionsSorciere = { antidote, ciblePoison: ciblePoison || null };

    return succes(partie, [
        evenementPrive("sorciere-confirmee", [joueurId], {
            antidote,
            ciblePoison: ciblePoison || null,
            potions: { ...partie.potions },
        }),
    ]);
}

export function actionCupidon(partie, joueurId, amoureux) {
    const erreur = verifierActeur(partie, joueurId, "cupidon", ETAPES_NUIT.CUPIDON);
    if (erreur) return echec(erreur);
    if (partie.amoureux) return echec("Les amoureux sont deja lies.");

    if (!Array.isArray(amoureux) || amoureux.length !== 2) {
        return echec("Il faut designer exactement deux joueurs.");
    }
    const [premierId, secondId] = amoureux;
    if (premierId === secondId) return echec("Choisissez deux joueurs differents.");

    const premier = joueur(partie, premierId);
    const second = joueur(partie, secondId);
    if (!premier?.vivant || !second?.vivant) return echec("Les deux joueurs doivent etre en vie.");

    partie.amoureux = [premierId, secondId];

    return succes(partie, [
        evenementPrive("amoureux", [premierId], { partenaireId: secondId, pseudo: second.pseudo }),
        evenementPrive("amoureux", [secondId], { partenaireId: premierId, pseudo: premier.pseudo }),
    ]);
}

export function actionChasseur(partie, joueurId, cibleId) {
    if (partie.enAttente?.type !== "chasseur" || partie.enAttente.joueurId !== joueurId) {
        return echec("Ce n'est pas a vous de tirer.");
    }

    const cible = joueur(partie, cibleId);
    if (!cible?.vivant) return echec("Cette cible n'est plus en vie.");

    partie.enAttente = null;
    // Le coup part au moment meme de sa mort, avant toute autre consequence.
    partie.fileMorts.unshift({ joueurId: cibleId, cause: CAUSES.CHASSEUR });

    const evenements = [
        evenementPublic("tir-chasseur", {
            chasseurId: joueurId,
            pseudo: joueur(partie, joueurId)?.pseudo ?? null,
            cibleId,
            ciblePseudo: cible.pseudo,
        }),
    ];
    evenements.push(...continuerResolution(partie));

    return succes(partie, evenements);
}

export function voterVillage(partie, joueurId, cibleId) {
    if (partie.phase !== PHASES.JOUR) return echec("Le vote n'est ouvert que le jour.");
    const votant = joueur(partie, joueurId);
    if (!votant?.vivant) return echec("Les morts ne votent plus.");

    const cible = joueur(partie, cibleId);
    if (!cible?.vivant) return echec("Cette cible n'est plus en vie.");
    if (cibleId === joueurId) return echec("On ne vote pas contre soi-meme.");

    partie.votesVillage.set(joueurId, cibleId);

    return succes(partie, [
        evenementPublic("votes-village", {
            comptes: compter(partie.votesVillage),
            votants: [...partie.votesVillage.keys()],
            total: joueursVivants(partie).length,
        }),
    ]);
}

// ─── Interventions du maitre du jeu ──────────────────────────────

export function tuerParMj(partie, joueurId) {
    const cible = joueur(partie, joueurId);
    if (!cible) return echec("Joueur inconnu.");
    if (!cible.vivant) return echec("Ce joueur est deja mort.");

    partie.fileMorts.push({ joueurId, cause: CAUSES.MJ });
    return succes(partie, continuerResolution(partie));
}

export function ressusciterParMj(partie, joueurId) {
    const cible = joueur(partie, joueurId);
    if (!cible) return echec("Joueur inconnu.");
    if (cible.vivant) return echec("Ce joueur est deja en vie.");

    cible.vivant = true;
    if (partie.phase === PHASES.TERMINEE) {
        partie.phase = PHASES.JOUR;
        partie.gagnant = null;
        partie.termineeLe = null;
    }

    return succes(partie, [
        evenementPublic("resurrection", { joueurId, pseudo: cible.pseudo }),
    ]);
}

export function changerRoleParMj(partie, joueurId, roleId) {
    const cible = joueur(partie, joueurId);
    if (!cible) return echec("Joueur inconnu.");
    if (!roleExiste(roleId)) return echec("Role inconnu.");

    cible.role = roleId;
    return succes(partie, [
        evenementPrive("role-attribue", [joueurId], { joueurId, role: roleId }),
    ]);
}

export function forcerPhaseParMj(partie, phase) {
    if (partie.phase === PHASES.ATTENTE) return echec("La partie n'est pas lancee.");
    if (phase === PHASES.NUIT) return succes(partie, ouvrirNuit(partie));
    if (phase === PHASES.JOUR) return succes(partie, ouvrirJour(partie));
    return echec("Phase inconnue.");
}

// ─── Utilitaire ──────────────────────────────────────────────────

/**
 * Depouille une Map<votantId, cibleId> en [[cibleId, nombre], …] du plus vote
 * au moins vote.
 */
function compter(votes) {
    const comptes = new Map();
    for (const cibleId of votes.values()) {
        comptes.set(cibleId, (comptes.get(cibleId) ?? 0) + 1);
    }
    return [...comptes.entries()].sort((a, b) => b[1] - a[1]);
}
