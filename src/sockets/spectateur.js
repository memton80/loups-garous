import { historiquePublic, vuePublique } from "../game/partie.js";
import { salleSpectateurs, salon } from "../salons.js";

/**
 * Ecran de suivi pour videoprojecteur ou television.
 *
 * Un spectateur ne fait qu'ecouter : il n'a aucune commande, et il ne recoit
 * que la vue publique — jamais le role d'un joueur encore en vie. C'est
 * volontairement le meme filtre que pour les joueurs, applique au meme
 * endroit, pour qu'il n'y ait qu'une seule regle de confidentialite a tenir.
 */
export function brancherSpectateur(io, socket) {
    socket.on("spectateur:suivre", ({ code } = {}, ack) => {
        const partie = salon(code);
        if (typeof ack !== "function") return;
        if (!partie) return ack({ ok: false, erreur: "Aucune partie ne porte ce code." });

        // Un ecran ne doit jamais etre aussi un joueur : on coupe le doute.
        socket.data.code = null;
        socket.data.joueurId = null;
        socket.join(salleSpectateurs(partie.code));

        ack({
            ok: true,
            partie: vuePublique(partie),
            journal: historiquePublic(partie),
        });
    });

    socket.on("spectateur:quitter", ({ code } = {}) => {
        if (code) socket.leave(salleSpectateurs(String(code).toUpperCase()));
    });
}
