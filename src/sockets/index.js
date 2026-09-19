import { brancherJoueur, deconnecterJoueur } from "./joueur.js";
import { brancherMaitreDuJeu } from "./mj.js";
import { brancherSpectateur } from "./spectateur.js";

/**
 * Branchement de tous les gestionnaires socket.
 *
 * Chaque socket arrive anonyme. Elle ne devient joueur qu'en rejoignant une
 * partie avec un code, et maitre du jeu qu'en presentant le bon code PIN :
 * ces deux etats sont poses sur socket.data et sont la seule source de verite
 * pour les autorisations. Rien de ce qui arrive dans un message ne sert a
 * decider ce que la socket a le droit de faire.
 */
export function brancherSockets(io) {
    io.on("connection", (socket) => {
        socket.data.code = null;
        socket.data.joueurId = null;
        socket.data.estMj = false;

        brancherJoueur(io, socket);
        brancherMaitreDuJeu(io, socket);
        brancherSpectateur(io, socket);

        socket.on("disconnect", () => deconnecterJoueur(io, socket));
    });
}
