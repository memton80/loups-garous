import {
    actionChasseur,
    actionCupidon,
    actionSorciere,
    actionVoyante,
    voterLoup,
    voterVillage,
} from "../game/moteur.js";
import {
    PHASES,
    ajouterJoueur,
    etatPersonnel,
    historiquePour,
    joueurParJeton,
    pseudoDejaPris,
    pseudoValide,
    vuePublique,
} from "../game/partie.js";
import { salleJoueurs, salon } from "../salons.js";
import { diffuser, envoyerListeParties, synchroniser } from "./diffusion.js";

/** Repond a l'accuse de reception si le client en a fourni un. */
function repondre(ack, reponse) {
    if (typeof ack === "function") ack(reponse);
}

/**
 * Retrouve la partie et le joueur a partir de la socket, JAMAIS a partir du
 * message recu. C'est la correction du defaut le plus discret de l'ancienne
 * version : les actions y portaient le code de la partie, si bien qu'un client
 * pouvait agir dans une partie ou il n'avait jamais mis les pieds.
 */
function contexte(socket) {
    const partie = salon(socket.data.code);
    if (!partie) return null;
    const joueur = partie.joueurs.get(socket.data.joueurId);
    if (!joueur) return null;
    return { partie, joueur };
}

function agir(io, socket, ack, executer) {
    const ctx = contexte(socket);
    if (!ctx) return repondre(ack, { ok: false, erreur: "Vous n'êtes dans aucune partie." });

    const resultat = executer(ctx.partie, ctx.joueur);
    if (!resultat.ok) return repondre(ack, { ok: false, erreur: resultat.erreur });

    diffuser(io, ctx.partie, resultat.evenements);
    repondre(ack, { ok: true });
}

export function brancherJoueur(io, socket) {
    socket.on("joueur:rejoindre", ({ code, pseudo, jeton } = {}, ack) => {
        const partie = salon(code);
        if (!partie) {
            return repondre(ack, { ok: false, erreur: "Aucune partie ne porte ce code." });
        }

        // Reconnexion : elle ne passe QUE par le jeton remis a l'entree.
        // Se presenter avec le pseudo de quelqu'un d'autre ne donne plus
        // acces a son role, c'etait la faille principale de l'ancien serveur.
        let joueur = joueurParJeton(partie, jeton);

        if (!joueur) {
            if (partie.phase !== PHASES.ATTENTE) {
                return repondre(ack, {
                    ok: false,
                    erreur: "La partie a déjà commencé.",
                });
            }
            if (!pseudoValide(pseudo)) {
                return repondre(ack, {
                    ok: false,
                    erreur: "Pseudo invalide : 2 à 20 caractères, lettres, chiffres, espace ou tiret.",
                });
            }
            if (pseudoDejaPris(partie, pseudo)) {
                return repondre(ack, {
                    ok: false,
                    erreur: "Ce pseudo est déjà pris dans cette partie.",
                });
            }
            joueur = ajouterJoueur(partie, pseudo);
        }

        // Une seule socket par joueur : la nouvelle chasse l'ancienne.
        if (joueur.socketId && joueur.socketId !== socket.id) {
            io.sockets.sockets.get(joueur.socketId)?.leave(salleJoueurs(partie.code));
        }

        joueur.socketId = socket.id;
        joueur.connecte = true;
        socket.data.code = partie.code;
        socket.data.joueurId = joueur.id;
        socket.join(salleJoueurs(partie.code));

        repondre(ack, {
            ok: true,
            jeton: joueur.jeton,
            moi: etatPersonnel(partie, joueur),
            partie: vuePublique(partie),
            journal: historiquePour(partie, joueur.id),
        });

        synchroniser(io, partie);
        envoyerListeParties(io);
    });

    socket.on("joueur:quitter", (_donnees, ack) => {
        const ctx = contexte(socket);
        if (ctx) {
            ctx.joueur.connecte = false;
            ctx.joueur.socketId = null;
            socket.leave(salleJoueurs(ctx.partie.code));
            synchroniser(io, ctx.partie);
        }
        socket.data.code = null;
        socket.data.joueurId = null;
        repondre(ack, { ok: true });
    });

    socket.on("joueur:vote-loup", ({ cibleId } = {}, ack) =>
        agir(io, socket, ack, (partie, joueur) => voterLoup(partie, joueur.id, cibleId))
    );

    socket.on("joueur:voyante", ({ cibleId } = {}, ack) =>
        agir(io, socket, ack, (partie, joueur) => actionVoyante(partie, joueur.id, cibleId))
    );

    socket.on("joueur:sorciere", ({ antidote, ciblePoison } = {}, ack) =>
        agir(io, socket, ack, (partie, joueur) =>
            actionSorciere(partie, joueur.id, {
                antidote: Boolean(antidote),
                ciblePoison: ciblePoison || null,
            })
        )
    );

    socket.on("joueur:cupidon", ({ amoureux } = {}, ack) =>
        agir(io, socket, ack, (partie, joueur) => actionCupidon(partie, joueur.id, amoureux))
    );

    socket.on("joueur:chasseur", ({ cibleId } = {}, ack) =>
        agir(io, socket, ack, (partie, joueur) => actionChasseur(partie, joueur.id, cibleId))
    );

    socket.on("joueur:vote", ({ cibleId } = {}, ack) =>
        agir(io, socket, ack, (partie, joueur) => voterVillage(partie, joueur.id, cibleId))
    );
}

/** Marque le joueur hors ligne sans le sortir de la partie. */
export function deconnecterJoueur(io, socket) {
    const ctx = contexte(socket);
    if (!ctx) return;
    if (ctx.joueur.socketId !== socket.id) return; // il s'est deja reconnecte ailleurs

    ctx.joueur.connecte = false;
    ctx.joueur.socketId = null;
    synchroniser(io, ctx.partie);
    envoyerListeParties(io);
}
