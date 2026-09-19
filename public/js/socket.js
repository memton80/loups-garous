/* global io */

/**
 * Connexion temps reel.
 *
 * `io()` sans argument se connecte a l'origine de la page. C'est ce qui
 * permet de ne plus ecrire l'adresse du serveur dans le front : l'ancienne
 * version repetait « http://192.168.1.21:3000 » dans cinq fichiers, et un
 * changement d'adresse cassait tout le site.
 */
export const socket = io();

/** Emet un message et attend la reponse du serveur, sous forme de promesse. */
export function demander(evenement, donnees = {}) {
    return new Promise((resoudre) => {
        socket.emit(evenement, donnees, (reponse) => {
            resoudre(reponse ?? { ok: false, erreur: "Pas de reponse du serveur." });
        });
    });
}

/** Memoire locale tolerante : un navigateur en navigation privee peut refuser. */
export const memoire = {
    lire(cle) {
        try {
            return window.localStorage.getItem(cle);
        } catch {
            return null;
        }
    },
    ecrire(cle, valeur) {
        try {
            window.localStorage.setItem(cle, valeur);
        } catch {
            /* tant pis : la reconnexion automatique ne marchera pas */
        }
    },
    effacer(cle) {
        try {
            window.localStorage.removeItem(cle);
        } catch {
            /* rien a faire */
        }
    },
};
