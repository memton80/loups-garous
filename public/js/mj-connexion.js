import { demander } from "./socket.js";
import { $, texte } from "./ui.js";

/**
 * Saisie du code du maître du jeu.
 *
 * Le code n'est jamais vérifié ici : la page l'envoie au serveur, qui seul
 * décide. L'ancienne version recevait en retour un « secret » partagé,
 * identique pour tout le monde ; elle reçoit maintenant un jeton de session
 * propre à cet onglet, que le serveur peut révoquer.
 */

const LONGUEUR = 4;
const CLE_SESSION = "loups-garous:mj";

let code = "";
let bloque = false;

const points = [0, 1, 2, 3].map((index) => $(`#point-${index}`));

function afficherPoints({ erreur = false } = {}) {
    points.forEach((point, index) => {
        point.className = "point-code";
        point.textContent = "";

        if (erreur && code[index]) {
            point.classList.add("erreur");
        } else if (index < code.length) {
            point.classList.add("rempli");
            point.textContent = code[index];
        } else if (index === code.length) {
            point.classList.add("actif");
        }
    });
}

function annoncer(message, type = "") {
    const zone = $("#etat-code");
    texte(zone, message);
    zone.className = `etat-code${message ? " visible" : ""}${type ? ` ${type}` : ""}`;
}

function saisir(chiffre) {
    if (bloque || code.length >= LONGUEUR) return;
    code += chiffre;
    afficherPoints();
    annoncer("");
    if (code.length === LONGUEUR) setTimeout(valider, 160);
}

function effacer() {
    if (bloque || code.length === 0) return;
    code = code.slice(0, -1);
    afficherPoints();
    annoncer("");
}

async function valider() {
    bloque = true;
    const reponse = await demander("mj:pin", { pin: code });

    if (reponse.ok) {
        try {
            window.sessionStorage.setItem(CLE_SESSION, reponse.jeton);
        } catch {
            // Navigation privée : la session ne survivra pas au rechargement,
            // mais l'onglet en cours fonctionne.
        }
        annoncer("Code accepté", "succes");
        setTimeout(() => { window.location.href = "/mj.html"; }, 500);
        return;
    }

    afficherPoints({ erreur: true });
    annoncer(
        reponse.attenteSecondes > 0
            ? `${reponse.erreur} ${reponse.attenteSecondes} s`
            : reponse.erreur,
        "echec"
    );

    setTimeout(() => {
        code = "";
        bloque = false;
        afficherPoints();
        annoncer("");
    }, 900);
}

for (const touche of document.querySelectorAll(".touche[data-chiffre]")) {
    touche.addEventListener("click", () => saisir(touche.dataset.chiffre));
}

$("#touche-effacer").addEventListener("click", effacer);

document.addEventListener("keydown", (evenement) => {
    if (evenement.key >= "0" && evenement.key <= "9") saisir(evenement.key);
    else if (evenement.key === "Backspace" || evenement.key === "Delete") effacer();
});

afficherPoints();
