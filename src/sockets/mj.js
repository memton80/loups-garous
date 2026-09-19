import { config } from "../config.js";
import {
    avancer,
    changerRoleParMj,
    forcerPhaseParMj,
    lancerPartie,
    ressusciterParMj,
    tuerParMj,
} from "../game/moteur.js";
import { compositionAutomatique, rolesDisponibles } from "../game/distribution.js";
import { PHASES, retirerJoueur, vueMaitreDuJeu } from "../game/partie.js";
import {
    SALLE_MJ,
    creerSalon,
    salleJoueurs,
    salleSpectateurs,
    salon,
    supprimerSalon,
    tousLesSalons,
} from "../salons.js";
import { archiveDeLaPartie, oublierPartie, partiesTerminees } from "../db/index.js";
import { sessionValide, verifierPin } from "./auth.js";
import { diffuser, envoyerListeParties, synchroniser } from "./diffusion.js";

function repondre(ack, reponse) {
    if (typeof ack === "function") ack(reponse);
}

/** Adresse de la socket, pour compter les tentatives de code. */
function adresseDe(socket) {
    return socket.handshake.address ?? "inconnue";
}

/**
 * Toute commande du maitre du jeu passe par ce garde : sans session valide,
 * la commande n'est meme pas lue.
 */
function exigerMj(socket, ack) {
    if (socket.data.estMj) return true;
    repondre(ack, { ok: false, erreur: "Vous n'etes pas authentifie." });
    return false;
}

/** Recupere la partie visee par une commande du maitre du jeu. */
function partieDe(code, ack) {
    const partie = salon(code);
    if (!partie) {
        repondre(ack, { ok: false, erreur: "Aucune partie ne porte ce code." });
        return null;
    }
    return partie;
}

/** Applique une commande du moteur et diffuse ce qui en sort. */
function commande(io, ack, partie, resultat) {
    if (!resultat.ok) return repondre(ack, { ok: false, erreur: resultat.erreur });
    diffuser(io, partie, resultat.evenements);
    envoyerListeParties(io);
    repondre(ack, { ok: true });
}

export function brancherMaitreDuJeu(io, socket) {
    socket.on("mj:pin", ({ pin } = {}, ack) => {
        const resultat = verifierPin(adresseDe(socket), pin);
        if (!resultat.ok) return repondre(ack, resultat);
        ouvrirSession(io, socket, resultat.jeton);
        repondre(ack, { ok: true, jeton: resultat.jeton });
    });

    socket.on("mj:session", ({ jeton } = {}, ack) => {
        if (!sessionValide(jeton)) {
            return repondre(ack, { ok: false, erreur: "Session expiree." });
        }
        ouvrirSession(io, socket, jeton);
        repondre(ack, { ok: true });
    });

    socket.on("mj:creer-partie", ({ code } = {}, ack) => {
        if (!exigerMj(socket, ack)) return;
        const resultat = creerSalon(code || null);
        if (!resultat.ok) return repondre(ack, resultat);
        envoyerListeParties(io);
        repondre(ack, { ok: true, code: resultat.partie.code });
    });

    socket.on("mj:supprimer-partie", ({ code } = {}, ack) => {
        if (!exigerMj(socket, ack)) return;
        const partie = partieDe(code, ack);
        if (!partie) return;

        io.to(salleJoueurs(partie.code)).emit("joueur:ejecte", {
            motif: "La partie a ete fermee par le maitre du jeu.",
        });
        io.socketsLeave(salleJoueurs(partie.code));
        io.socketsLeave(salleSpectateurs(partie.code));
        supprimerSalon(partie.code);

        // Une partie qui n'a jamais demarre ne merite pas de trace ; des
        // qu'elle a ete jouee, son deroule reste archive pour l'historique.
        if (partie.phase === PHASES.ATTENTE) oublierPartie(partie.code);

        envoyerListeParties(io);
        repondre(ack, { ok: true });
    });

    socket.on("mj:composition-auto", ({ code } = {}, ack) => {
        if (!exigerMj(socket, ack)) return;
        const partie = partieDe(code, ack);
        if (!partie) return;
        repondre(ack, {
            ok: true,
            composition: compositionAutomatique(partie.joueurs.size),
        });
    });

    socket.on("mj:lancer", ({ code, composition } = {}, ack) => {
        if (!exigerMj(socket, ack)) return;
        const partie = partieDe(code, ack);
        if (!partie) return;

        if (partie.joueurs.size < config.joueursMinimum) {
            return repondre(ack, {
                ok: false,
                erreur: `Il faut au moins ${config.joueursMinimum} joueurs pour commencer.`,
            });
        }

        const choisie = composition ?? compositionAutomatique(partie.joueurs.size);
        commande(io, ack, partie, lancerPartie(partie, choisie));
    });

    socket.on("mj:avancer", ({ code, forcer } = {}, ack) => {
        if (!exigerMj(socket, ack)) return;
        const partie = partieDe(code, ack);
        if (!partie) return;
        commande(io, ack, partie, avancer(partie, { forcer: Boolean(forcer) }));
    });

    socket.on("mj:forcer-phase", ({ code, phase } = {}, ack) => {
        if (!exigerMj(socket, ack)) return;
        const partie = partieDe(code, ack);
        if (!partie) return;
        commande(io, ack, partie, forcerPhaseParMj(partie, phase));
    });

    socket.on("mj:tuer", ({ code, joueurId } = {}, ack) => {
        if (!exigerMj(socket, ack)) return;
        const partie = partieDe(code, ack);
        if (!partie) return;
        commande(io, ack, partie, tuerParMj(partie, joueurId));
    });

    socket.on("mj:ressusciter", ({ code, joueurId } = {}, ack) => {
        if (!exigerMj(socket, ack)) return;
        const partie = partieDe(code, ack);
        if (!partie) return;
        commande(io, ack, partie, ressusciterParMj(partie, joueurId));
    });

    socket.on("mj:changer-role", ({ code, joueurId, role } = {}, ack) => {
        if (!exigerMj(socket, ack)) return;
        const partie = partieDe(code, ack);
        if (!partie) return;
        commande(io, ack, partie, changerRoleParMj(partie, joueurId, role));
    });

    socket.on("mj:ejecter", ({ code, joueurId } = {}, ack) => {
        if (!exigerMj(socket, ack)) return;
        const partie = partieDe(code, ack);
        if (!partie) return;

        const joueur = partie.joueurs.get(joueurId);
        if (!joueur) return repondre(ack, { ok: false, erreur: "Joueur inconnu." });

        const socketJoueur = joueur.socketId ? io.sockets.sockets.get(joueur.socketId) : null;
        socketJoueur?.emit("joueur:ejecte", {
            motif: "Le maitre du jeu vous a retire de la partie.",
        });
        socketJoueur?.leave(salleJoueurs(partie.code));
        if (socketJoueur) {
            socketJoueur.data.code = null;
            socketJoueur.data.joueurId = null;
        }

        retirerJoueur(partie, joueurId);
        synchroniser(io, partie);
        envoyerListeParties(io);
        repondre(ack, { ok: true });
    });

    socket.on("mj:journal", ({ code } = {}, ack) => {
        if (!exigerMj(socket, ack)) return;
        const partie = partieDe(code, ack);
        if (!partie) return;
        repondre(ack, {
            ok: true,
            // Le maitre du jeu a droit au journal complet, confidences comprises.
            evenements: partie.historique.map(({ destinataires, ...reste }) => reste),
        });
    });

    socket.on("mj:archives", ({ limite } = {}, ack) => {
        if (!exigerMj(socket, ack)) return;
        repondre(ack, {
            ok: true,
            parties: partiesTerminees(Math.min(Number(limite) || 50, 200)),
        });
    });

    socket.on("mj:archive", ({ code } = {}, ack) => {
        if (!exigerMj(socket, ack)) return;
        const archive = archiveDeLaPartie(String(code ?? "").toUpperCase());
        if (!archive) return repondre(ack, { ok: false, erreur: "Partie inconnue dans l'historique." });
        repondre(ack, { ok: true, archive });
    });

    socket.on("mj:catalogue", (_donnees, ack) => {
        if (!exigerMj(socket, ack)) return;
        repondre(ack, { ok: true, roles: rolesDisponibles() });
    });
}

function ouvrirSession(io, socket, jeton) {
    socket.data.estMj = true;
    socket.data.jetonMj = jeton;
    socket.join(SALLE_MJ);
    socket.emit("mj:parties", tousLesSalons().map(vueMaitreDuJeu));
}
