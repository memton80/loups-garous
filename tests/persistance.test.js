import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";

import { io as connecter } from "socket.io-client";

import { creerServeur } from "../src/app.js";
import { config } from "../src/config.js";
import { archiveDeLaPartie, fermerBase, partiesTerminees } from "../src/db/index.js";
import { salon, viderSalons } from "../src/salons.js";
import { reinitialiserAuth } from "../src/sockets/auth.js";

/**
 * Archivage et reprise apres redemarrage.
 *
 * Ces tests ecrivent dans un vrai fichier SQLite place dans un dossier
 * temporaire : c'est le comportement du disque qu'on veut verifier, pas celui
 * d'une base en memoire qui disparaitrait avec le processus. Chaque test a son
 * propre fichier, pour qu'aucun n'herite de l'etat du precedent.
 */

let dossier;
let fichierBase;
let serveur = null;
let url;
let compteur = 0;
const clients = [];

function client() {
    const socket = connecter(url, { transports: ["websocket"], forceNew: true });
    clients.push(socket);
    return socket;
}

function demander(socket, evenement, donnees) {
    return new Promise((resoudre, rejeter) => {
        const minuteur = setTimeout(
            () => rejeter(new Error(`Pas de reponse a « ${evenement} »`)),
            2000
        );
        socket.emit(evenement, donnees, (reponse) => {
            clearTimeout(minuteur);
            resoudre(reponse);
        });
    });
}

/** Demarre un serveur ; rappelee telle quelle, elle simule un redemarrage. */
async function demarrer({ reprendre = true } = {}) {
    serveur = creerServeur({ fichierBase, reprendre });
    await new Promise((resoudre) => serveur.serveurHttp.listen(0, resoudre));
    url = `http://localhost:${serveur.serveurHttp.address().port}`;
    return serveur;
}

async function arreter() {
    for (const socket of clients.splice(0)) socket.disconnect();
    if (serveur) {
        // io.close ferme aussi le serveur HTTP sous-jacent ; fermer les deux
        // laisserait la fermeture en suspens et bloquerait la fin des tests.
        await new Promise((resoudre) => serveur.io.close(resoudre));
        serveur = null;
    }
    fermerBase();
    viderSalons();
}

before(() => {
    dossier = mkdtempSync(join(tmpdir(), "loups-garous-"));
});

after(() => {
    rmSync(dossier, { recursive: true, force: true });
});

beforeEach(() => {
    compteur += 1;
    fichierBase = join(dossier, `partie-${compteur}.db`);
    reinitialiserAuth();
});

// Un test qui echoue ne doit pas laisser un serveur ouvert derriere lui.
afterEach(() => arreter());

/** Ouvre une session de maitre du jeu. */
async function maitreDuJeu() {
    const socket = client();
    await demander(socket, "mj:pin", { pin: config.adminPin });
    return socket;
}

/** Joue une partie jusqu'a la victoire du village. */
async function jouerUnePartie(code) {
    const mj = await maitreDuJeu();
    await demander(mj, "mj:creer-partie", { code });

    const entrees = [];
    for (const pseudo of ["Ana", "Bob", "Cid", "Dea", "Eve"]) {
        const socket = client();
        const reponse = await demander(socket, "joueur:rejoindre", { code, pseudo });
        entrees.push({ pseudo, socket, ...reponse });
    }

    await demander(mj, "mj:lancer", {
        code,
        composition: { "loup-garou": 1, voyante: 1, sorciere: 1, villageois: 2 },
    });

    const partie = salon(code);
    const loup = [...partie.joueurs.values()].find((j) => j.role === "loup-garou");
    await demander(mj, "mj:tuer", { code, joueurId: loup.id });

    return { mj, entrees, partie };
}

/** Prepare une partie lancee, sans la terminer. */
async function partieEnCours(code) {
    const mj = await maitreDuJeu();
    await demander(mj, "mj:creer-partie", { code });

    const entrees = [];
    for (const pseudo of ["Ana", "Bob", "Cid", "Dea", "Eve"]) {
        const socket = client();
        const reponse = await demander(socket, "joueur:rejoindre", { code, pseudo });
        entrees.push({ pseudo, ...reponse });
    }

    await demander(mj, "mj:lancer", {
        code,
        composition: { "loup-garou": 1, voyante: 1, sorciere: 1, villageois: 2 },
    });

    return { mj, entrees };
}

describe("archivage", () => {
    it("garde le deroule complet d'une partie terminee", async () => {
        await demarrer({ reprendre: false });
        const { partie } = await jouerUnePartie("ARC1");
        assert.equal(partie.gagnant, "village");

        const archive = archiveDeLaPartie("ARC1");
        assert.ok(archive, "la partie doit etre archivee");
        assert.equal(archive.gagnant, "village");
        assert.equal(archive.joueurs.length, 5);
        assert.ok(archive.joueurs.every((j) => j.role !== null), "les roles sont archives");

        const types = archive.evenements.map((e) => e.type);
        for (const attendu of ["role-attribue", "phase", "mort", "victoire"]) {
            assert.ok(types.includes(attendu), `le deroule doit contenir « ${attendu} »`);
        }
    });

    it("conserve la visibilite de chaque evenement, pour rejouer sans tout devoiler", async () => {
        await demarrer({ reprendre: false });
        await jouerUnePartie("ARC2");
        const archive = archiveDeLaPartie("ARC2");

        const attributions = archive.evenements.filter((e) => e.type === "role-attribue");
        assert.equal(attributions.length, 5);
        assert.ok(attributions.every((e) => e.visibilite === "privee"));

        const phases = archive.evenements.filter((e) => e.type === "phase");
        assert.ok(phases.length > 0);
        assert.ok(phases.every((e) => e.visibilite === "publique"));
    });

    it("liste les parties terminees, la plus recente en tete", async () => {
        await demarrer({ reprendre: false });
        await jouerUnePartie("ARC3");

        const liste = partiesTerminees(10);
        assert.equal(liste.length, 1);
        assert.equal(liste[0].code, "ARC3");
        assert.equal(liste[0].gagnant, "village");
        assert.equal(liste[0].nombreJoueurs, 5);
        assert.ok(liste[0].termineeLe >= liste[0].creeeLe);
    });

    it("sert l'historique au maitre du jeu, et a lui seul", async () => {
        await demarrer({ reprendre: false });
        const { mj } = await jouerUnePartie("ARC4");

        const autorise = await demander(mj, "mj:archive", { code: "ARC4" });
        assert.equal(autorise.ok, true);
        assert.equal(autorise.archive.gagnant, "village");

        const refuse = await demander(client(), "mj:archive", { code: "ARC4" });
        assert.equal(refuse.ok, false);
        assert.match(refuse.erreur, /authentifié/);
    });

    it("ne garde aucune trace d'une partie fermee avant d'avoir commence", async () => {
        await demarrer({ reprendre: false });
        const mj = await maitreDuJeu();
        await demander(mj, "mj:creer-partie", { code: "VIDE" });
        await demander(client(), "joueur:rejoindre", { code: "VIDE", pseudo: "Ana" });

        await demander(mj, "mj:supprimer-partie", { code: "VIDE" });
        assert.equal(archiveDeLaPartie("VIDE"), null);
    });

    it("garde en revanche la trace d'une partie fermee en cours de route", async () => {
        await demarrer({ reprendre: false });
        const { mj } = await partieEnCours("ENCO");

        await demander(mj, "mj:supprimer-partie", { code: "ENCO" });
        assert.ok(archiveDeLaPartie("ENCO"), "une partie deja jouee reste consultable");
    });
});

describe("reprise apres redemarrage", () => {
    it("recharge une partie en cours et rend son role a chacun", async () => {
        await demarrer({ reprendre: false });
        const { entrees } = await partieEnCours("REPR");

        const rolesAvant = new Map(
            [...salon("REPR").joueurs.values()].map((j) => [j.pseudo, j.role])
        );
        const tourAvant = salon("REPR").tour;

        // Coupure franche : le serveur s'arrete, la memoire est perdue.
        await arreter();
        assert.equal(salon("REPR"), null);

        const redemarre = await demarrer({ reprendre: true });
        assert.equal(redemarre.reprises, 1, "la partie en cours doit etre reprise");

        const partie = salon("REPR");
        assert.ok(partie, "la partie doit etre de nouveau en memoire");
        assert.equal(partie.tour, tourAvant);
        assert.equal(partie.phase, "nuit");
        for (const [pseudo, role] of rolesAvant) {
            const joueur = [...partie.joueurs.values()].find((j) => j.pseudo === pseudo);
            assert.equal(joueur.role, role, `${pseudo} doit retrouver son role`);
        }

        // Chacun se reconnecte avec son jeton et reprend exactement sa place.
        for (const entree of entrees) {
            const retour = await demander(client(), "joueur:rejoindre", {
                code: "REPR",
                pseudo: entree.pseudo,
                jeton: entree.jeton,
            });
            assert.equal(retour.ok, true, `${entree.pseudo} doit pouvoir revenir`);
            assert.equal(retour.moi.role, rolesAvant.get(entree.pseudo));
        }
    });

    it("marque tout le monde hors ligne a la reprise, en attendant les reconnexions", async () => {
        await demarrer({ reprendre: false });
        await partieEnCours("HORS");
        await arreter();
        await demarrer({ reprendre: true });

        const partie = salon("HORS");
        assert.ok([...partie.joueurs.values()].every((j) => !j.connecte));
        assert.ok([...partie.joueurs.values()].every((j) => j.socketId === null));
    });

    it("ne reprend pas une partie deja terminee", async () => {
        await demarrer({ reprendre: false });
        await jouerUnePartie("FINI");
        await arreter();

        const redemarre = await demarrer({ reprendre: true });
        assert.equal(redemarre.reprises, 0);
        assert.equal(salon("FINI"), null);
        assert.ok(archiveDeLaPartie("FINI"), "elle reste consultable dans l'historique");
    });
});
