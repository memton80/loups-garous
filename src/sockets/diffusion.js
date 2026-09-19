import {
    etatPersonnel,
    tousLesJoueurs,
    vueMaitreDuJeu,
    vuePublique,
} from "../game/partie.js";
import { SALLE_MJ, salleJoueurs, salleSpectateurs, tousLesSalons } from "../salons.js";

/**
 * Aiguillage des evenements du moteur vers les sockets.
 *
 * Le moteur ne sait pas qui est connecte ; il se contente de marquer chaque
 * evenement « publique » ou « privee, pour ces joueurs-la ». Tout le tri se
 * fait ici, en un seul endroit, ce qui evite de reflechir a la confidentialite
 * a chaque nouvel evenement.
 */

/** On n'envoie pas la liste des destinataires aux destinataires. */
function sansEnveloppe({ destinataires, visibilite, ...contenu }) {
    return contenu;
}

function socketDuJoueur(io, partie, joueurId) {
    const joueur = partie.joueurs.get(joueurId);
    if (!joueur?.socketId) return null;
    return io.sockets.sockets.get(joueur.socketId) ?? null;
}

export function diffuser(io, partie, evenements = []) {
    for (const evenement of evenements) {
        const contenu = sansEnveloppe(evenement);

        if (evenement.visibilite === "publique") {
            io.to(salleJoueurs(partie.code)).emit("partie:evenement", contenu);
            io.to(salleSpectateurs(partie.code)).emit("partie:evenement", contenu);
        } else {
            for (const joueurId of evenement.destinataires ?? []) {
                socketDuJoueur(io, partie, joueurId)?.emit("partie:evenement", contenu);
            }
        }

        // Le maitre du jeu voit tout : c'est lui qui arbitre.
        io.to(SALLE_MJ).emit("mj:evenement", { code: partie.code, ...contenu });
    }

    synchroniser(io, partie);
}

/**
 * Renvoie a chacun l'etat qui le concerne. Appelee apres chaque changement,
 * plutot que de laisser le client deduire l'etat des evenements recus : un
 * client qui a rate un message se remet ainsi tout seul a jour.
 */
export function synchroniser(io, partie) {
    const vue = vuePublique(partie);
    io.to(salleJoueurs(partie.code)).emit("partie:etat", vue);
    io.to(salleSpectateurs(partie.code)).emit("partie:etat", vue);
    io.to(SALLE_MJ).emit("mj:partie", vueMaitreDuJeu(partie));

    for (const joueur of tousLesJoueurs(partie)) {
        socketDuJoueur(io, partie, joueur.id)?.emit(
            "joueur:etat",
            etatPersonnel(partie, joueur)
        );
    }
}

/** Liste complete des parties, pour le tableau de bord du maitre du jeu. */
export function envoyerListeParties(io) {
    io.to(SALLE_MJ).emit("mj:parties", tousLesSalons().map(vueMaitreDuJeu));
}
