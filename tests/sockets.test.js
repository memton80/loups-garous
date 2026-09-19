import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { io as connecter } from "socket.io-client";

import { creerServeur } from "../src/app.js";
import { config } from "../src/config.js";
import { creerSalon, viderSalons } from "../src/salons.js";
import { reinitialiserAuth } from "../src/sockets/auth.js";

/**
 * Tests de bout en bout de la couche reseau : un vrai serveur, de vrais
 * clients socket.io. Ils portent surtout sur ce que le moteur ne peut pas
 * garantir seul — qui a le droit de faire quoi, et qui apprend quoi.
 */

let serveurHttp;
let url;
const clients = [];

/** Ouvre un client et le referme automatiquement en fin de test. */
function client() {
    const socket = connecter(url, { transports: ["websocket"], forceNew: true });
    clients.push(socket);
    return socket;
}

/** Emet avec accuse de reception, sous forme de promesse. */
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

/** Attend le prochain message d'un type donne. */
function attendre(socket, evenement, delai = 2000) {
    return new Promise((resoudre, rejeter) => {
        const minuteur = setTimeout(
            () => rejeter(new Error(`« ${evenement} » n'est jamais arrive`)),
            delai
        );
        socket.once(evenement, (donnees) => {
            clearTimeout(minuteur);
            resoudre(donnees);
        });
    });
}

before(async () => {
    // Base en memoire : les tests ne doivent jamais toucher au fichier reel.
    const serveur = creerServeur({ fichierBase: ":memory:", reprendre: false });
    serveurHttp = serveur.serveurHttp;
    await new Promise((resoudre) => serveurHttp.listen(0, resoudre));
    url = `http://localhost:${serveurHttp.address().port}`;
});

after(async () => {
    for (const socket of clients) socket.close();
    await new Promise((resoudre) => serveurHttp.close(resoudre));
});

beforeEach(() => {
    for (const socket of clients.splice(0)) socket.close();
    viderSalons();
    reinitialiserAuth();
});

/** Cree une partie et y fait entrer des joueurs. */
async function partieAvecJoueurs(pseudos) {
    const { partie } = creerSalon("TEST");
    const entrees = [];
    for (const pseudo of pseudos) {
        const socket = client();
        const reponse = await demander(socket, "joueur:rejoindre", { code: "TEST", pseudo });
        assert.ok(reponse.ok, reponse.erreur);
        entrees.push({ socket, ...reponse });
    }
    return { partie, entrees };
}

describe("entree dans une partie", () => {
    it("accueille un joueur et lui remet un jeton personnel", async () => {
        creerSalon("TEST");
        const reponse = await demander(client(), "joueur:rejoindre", {
            code: "TEST",
            pseudo: "Ana",
        });

        assert.equal(reponse.ok, true);
        assert.equal(typeof reponse.jeton, "string");
        assert.ok(reponse.jeton.length > 20, "le jeton doit etre difficile a deviner");
        assert.equal(reponse.moi.pseudo, "Ana");
    });

    it("refuse un code de partie inconnu", async () => {
        const reponse = await demander(client(), "joueur:rejoindre", {
            code: "ZZZZ",
            pseudo: "Ana",
        });
        assert.equal(reponse.ok, false);
    });

    it("refuse un pseudo vide, trop long ou plein de balises", async () => {
        creerSalon("TEST");
        for (const pseudo of ["", "A", "x".repeat(21), "<img src=x onerror=alert(1)>"]) {
            const reponse = await demander(client(), "joueur:rejoindre", { code: "TEST", pseudo });
            assert.equal(reponse.ok, false, `« ${pseudo} » aurait du etre refuse`);
        }
    });

    it("refuse un joueur apres le lancement de la partie", async () => {
        const { partie } = await partieAvecJoueurs(["Ana", "Bob", "Cid", "Dea"]);
        partie.phase = "nuit";

        const reponse = await demander(client(), "joueur:rejoindre", {
            code: "TEST",
            pseudo: "Eve",
        });
        assert.equal(reponse.ok, false);
        assert.match(reponse.erreur, /déjà commencé/);
    });
});

describe("usurpation d'identite", () => {
    it("refuse un second joueur portant le meme pseudo", async () => {
        creerSalon("TEST");
        assert.ok((await demander(client(), "joueur:rejoindre", { code: "TEST", pseudo: "Ana" })).ok);

        const imposteur = await demander(client(), "joueur:rejoindre", {
            code: "TEST",
            pseudo: "Ana",
        });
        assert.equal(imposteur.ok, false);
        assert.match(imposteur.erreur, /déjà pris/);
    });

    it("refuse aussi la meme casse et les espaces autour", async () => {
        creerSalon("TEST");
        await demander(client(), "joueur:rejoindre", { code: "TEST", pseudo: "Ana" });

        for (const variante of ["ana", "ANA", "  Ana  "]) {
            const reponse = await demander(client(), "joueur:rejoindre", {
                code: "TEST",
                pseudo: variante,
            });
            assert.equal(reponse.ok, false, `« ${variante} » aurait du etre refuse`);
        }
    });

    it("ne rend le role qu'au porteur du jeton, jamais au porteur du pseudo", async () => {
        const { partie, entrees } = await partieAvecJoueurs(["Ana", "Bob", "Cid", "Dea"]);
        const [ana] = entrees;
        partie.joueurs.get(ana.moi.joueurId).role = "voyante";
        partie.phase = "nuit";

        // L'imposteur connait le pseudo d'Ana, mais pas son jeton.
        const imposteur = await demander(client(), "joueur:rejoindre", {
            code: "TEST",
            pseudo: "Ana",
        });
        assert.equal(imposteur.ok, false);

        // Ana, elle, retrouve son role avec son jeton.
        const retour = await demander(client(), "joueur:rejoindre", {
            code: "TEST",
            pseudo: "Ana",
            jeton: ana.jeton,
        });
        assert.equal(retour.ok, true);
        assert.equal(retour.moi.role, "voyante");
    });

    it("ignore un jeton invente", async () => {
        const { partie } = await partieAvecJoueurs(["Ana", "Bob", "Cid", "Dea"]);
        partie.phase = "nuit";

        const reponse = await demander(client(), "joueur:rejoindre", {
            code: "TEST",
            pseudo: "Ana",
            jeton: "00000000-0000-0000-0000-000000000000",
        });
        assert.equal(reponse.ok, false);
    });
});

describe("portee des actions", () => {
    it("refuse toute action a une socket qui n'a rejoint aucune partie", async () => {
        await partieAvecJoueurs(["Ana", "Bob", "Cid", "Dea"]);
        const intrus = client();

        for (const action of ["joueur:vote", "joueur:vote-loup", "joueur:voyante"]) {
            const reponse = await demander(intrus, action, { cibleId: "peu-importe" });
            assert.equal(reponse.ok, false, `${action} aurait du etre refusee`);
            assert.match(reponse.erreur, /aucune partie/);
        }
    });

    it("ne permet pas d'agir dans une partie voisine", async () => {
        const { entrees } = await partieAvecJoueurs(["Ana", "Bob", "Cid", "Dea"]);
        const { partie: autre } = creerSalon("AUTR");
        const victime = autre.joueurs;

        // Ana est dans TEST. Elle tente de voter dans AUTR : le serveur ne lit
        // meme pas le code envoye, il utilise celui de sa socket.
        const reponse = await demander(entrees[0].socket, "joueur:vote", {
            code: "AUTR",
            cibleId: [...victime.keys()][0] ?? "inconnu",
        });
        assert.equal(reponse.ok, false);
    });
});

describe("authentification du maitre du jeu", () => {
    it("refuse un code errone et accepte le bon", async () => {
        const socket = client();
        assert.equal((await demander(socket, "mj:pin", { pin: "0000" })).ok, false);

        const reponse = await demander(socket, "mj:pin", { pin: config.adminPin });
        assert.equal(reponse.ok, true);
        assert.equal(typeof reponse.jeton, "string");
        assert.ok(reponse.jeton.length >= 64, "le jeton de session doit etre long");
    });

    it("delivre un jeton different a chaque session", async () => {
        const premier = await demander(client(), "mj:pin", { pin: config.adminPin });
        const second = await demander(client(), "mj:pin", { pin: config.adminPin });
        assert.notEqual(premier.jeton, second.jeton);
    });

    it("impose une attente apres des essais repetes", async () => {
        const socket = client();
        let derniere;
        for (let essai = 0; essai < 6; essai += 1) {
            derniere = await demander(socket, "mj:pin", { pin: "9999" });
        }
        assert.equal(derniere.ok, false);
        assert.ok(derniere.attenteSecondes > 0, "une attente doit etre imposee");

        // Meme le bon code doit attendre : sinon le comptage ne sert a rien.
        const avecLeBonCode = await demander(socket, "mj:pin", { pin: config.adminPin });
        assert.equal(avecLeBonCode.ok, false);
    });

    it("refuse toutes les commandes a une socket non authentifiee", async () => {
        creerSalon("TEST");
        const intrus = client();

        const commandes = [
            ["mj:creer-partie", {}],
            ["mj:lancer", { code: "TEST" }],
            ["mj:avancer", { code: "TEST" }],
            ["mj:tuer", { code: "TEST", joueurId: "x" }],
            ["mj:journal", { code: "TEST" }],
        ];

        for (const [nom, donnees] of commandes) {
            const reponse = await demander(intrus, nom, donnees);
            assert.equal(reponse.ok, false, `${nom} aurait du etre refusee`);
            assert.match(reponse.erreur, /authentifié/);
        }
    });

    it("refuse un jeton de session invente", async () => {
        const reponse = await demander(client(), "mj:session", { jeton: "a".repeat(64) });
        assert.equal(reponse.ok, false);
    });
});

describe("confidentialite sur le reseau", () => {
    it("ne diffuse jamais le role d'un joueur vivant dans l'etat public", async () => {
        const { partie, entrees } = await partieAvecJoueurs(["Ana", "Bob", "Cid", "Dea"]);

        const mj = client();
        await demander(mj, "mj:pin", { pin: config.adminPin });

        const etatRecu = attendre(entrees[0].socket, "partie:etat");
        await demander(mj, "mj:lancer", {
            code: "TEST",
            composition: { "loup-garou": 1, voyante: 1, villageois: 2 },
        });

        const etat = await etatRecu;
        for (const joueur of etat.joueurs) {
            if (joueur.vivant) {
                assert.equal(joueur.role, null, `le role de ${joueur.pseudo} ne doit pas circuler`);
            }
        }
        assert.equal(partie.phase, "nuit");
    });

    it("n'envoie son role qu'au joueur concerne", async () => {
        const { entrees } = await partieAvecJoueurs(["Ana", "Bob", "Cid", "Dea"]);

        const recus = entrees.map((entree) => {
            const roles = [];
            entree.socket.on("partie:evenement", (evenement) => {
                if (evenement.type === "role-attribue") roles.push(evenement.role);
            });
            return roles;
        });

        const mj = client();
        await demander(mj, "mj:pin", { pin: config.adminPin });
        await demander(mj, "mj:lancer", {
            code: "TEST",
            composition: { "loup-garou": 1, voyante: 1, villageois: 2 },
        });
        await new Promise((resoudre) => setTimeout(resoudre, 150));

        for (const roles of recus) {
            assert.equal(roles.length, 1, "chacun ne doit recevoir qu'un seul role : le sien");
        }
    });

    it("donne au spectateur la vue publique, sans les roles des vivants", async () => {
        const { entrees } = await partieAvecJoueurs(["Ana", "Bob", "Cid", "Dea"]);
        const mj = client();
        await demander(mj, "mj:pin", { pin: config.adminPin });
        await demander(mj, "mj:lancer", {
            code: "TEST",
            composition: { "loup-garou": 1, voyante: 1, villageois: 2 },
        });

        const reponse = await demander(client(), "spectateur:suivre", { code: "TEST" });
        assert.equal(reponse.ok, true);
        for (const joueur of reponse.partie.joueurs) {
            if (joueur.vivant) assert.equal(joueur.role, null);
        }
        assert.ok(!JSON.stringify(reponse.journal).includes("role-attribue"));
        assert.ok(entrees.length > 0);
    });

    it("donne au maitre du jeu tous les roles, c'est lui qui arbitre", async () => {
        await partieAvecJoueurs(["Ana", "Bob", "Cid", "Dea"]);
        const mj = client();
        await demander(mj, "mj:pin", { pin: config.adminPin });

        const liste = attendre(mj, "mj:parties");
        await demander(mj, "mj:lancer", {
            code: "TEST",
            composition: { "loup-garou": 1, voyante: 1, villageois: 2 },
        });

        const parties = await liste;
        const partie = parties.find((p) => p.code === "TEST");
        assert.ok(partie.joueurs.every((j) => j.role !== null));
    });
});

describe("conduite de la partie par le maitre du jeu", () => {
    it("refuse de lancer en dessous du minimum de joueurs", async () => {
        await partieAvecJoueurs(["Ana", "Bob"]);
        const mj = client();
        await demander(mj, "mj:pin", { pin: config.adminPin });

        const reponse = await demander(mj, "mj:lancer", { code: "TEST" });
        assert.equal(reponse.ok, false);
        assert.match(reponse.erreur, /au moins/);
    });

    it("ejecte un joueur et le previent", async () => {
        const { partie, entrees } = await partieAvecJoueurs(["Ana", "Bob", "Cid", "Dea"]);
        const mj = client();
        await demander(mj, "mj:pin", { pin: config.adminPin });

        const avertissement = attendre(entrees[0].socket, "joueur:ejecte");
        await demander(mj, "mj:ejecter", { code: "TEST", joueurId: entrees[0].moi.joueurId });

        const motif = await avertissement;
        assert.match(motif.motif, /retiré/);
        assert.equal(partie.joueurs.size, 3);
    });

    it("propose une composition adaptee au nombre de joueurs", async () => {
        await partieAvecJoueurs(["Ana", "Bob", "Cid", "Dea", "Eve", "Fay"]);
        const mj = client();
        await demander(mj, "mj:pin", { pin: config.adminPin });

        const reponse = await demander(mj, "mj:composition-auto", { code: "TEST" });
        assert.equal(reponse.ok, true);
        const total = Object.values(reponse.composition).reduce((somme, n) => somme + n, 0);
        assert.equal(total, 6);
    });

    it("refuse une composition qui ne correspond pas aux joueurs presents", async () => {
        await partieAvecJoueurs(["Ana", "Bob", "Cid", "Dea"]);
        const mj = client();
        await demander(mj, "mj:pin", { pin: config.adminPin });

        const reponse = await demander(mj, "mj:lancer", {
            code: "TEST",
            composition: { "loup-garou": 1, villageois: 1 },
        });
        assert.equal(reponse.ok, false);
    });
});

describe("reconnexion", () => {
    it("retrouve le role, le journal et la place dans la nuit", async () => {
        const { entrees } = await partieAvecJoueurs(["Ana", "Bob", "Cid", "Dea", "Eve"]);
        const mj = client();
        await demander(mj, "mj:pin", { pin: config.adminPin });
        await demander(mj, "mj:lancer", {
            code: "TEST",
            composition: { "loup-garou": 1, voyante: 1, sorciere: 1, villageois: 2 },
        });
        await new Promise((resoudre) => setTimeout(resoudre, 100));

        const ana = entrees[0];
        ana.socket.close();
        await new Promise((resoudre) => setTimeout(resoudre, 100));

        const retour = await demander(client(), "joueur:rejoindre", {
            code: "TEST",
            pseudo: "Ana",
            jeton: ana.jeton,
        });

        assert.equal(retour.ok, true);
        assert.equal(retour.moi.joueurId, ana.moi.joueurId);
        assert.ok(retour.moi.role, "le role doit etre retrouve");
        assert.equal(retour.moi.phase, "nuit");
        assert.ok(retour.journal.length > 0, "le journal doit etre restitue");
    });

    it("ne rend a chacun que ses propres confidences dans le journal", async () => {
        const { entrees } = await partieAvecJoueurs(["Ana", "Bob", "Cid", "Dea", "Eve"]);
        const mj = client();
        await demander(mj, "mj:pin", { pin: config.adminPin });
        await demander(mj, "mj:lancer", {
            code: "TEST",
            composition: { "loup-garou": 1, voyante: 1, sorciere: 1, villageois: 2 },
        });
        await new Promise((resoudre) => setTimeout(resoudre, 100));

        for (const entree of entrees) {
            const retour = await demander(client(), "joueur:rejoindre", {
                code: "TEST",
                pseudo: entree.moi.pseudo,
                jeton: entree.jeton,
            });
            const attributions = retour.journal.filter((e) => e.type === "role-attribue");
            assert.equal(attributions.length, 1);
            assert.equal(attributions[0].joueurId, entree.moi.joueurId);
        }
    });
});
