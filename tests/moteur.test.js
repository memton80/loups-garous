import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ETAPES_NUIT } from "../public/js/partage/roles.js";
import {
    actionChasseur,
    actionCupidon,
    actionSorciere,
    actionVoyante,
    avancer,
    lancerPartie,
    tuerParMj,
    voterLoup,
    voterVillage,
} from "../src/game/moteur.js";
import { PHASES, creerPartie, ajouterJoueur, etapeCourante } from "../src/game/partie.js";
import { CAMPS_VICTORIEUX } from "../src/game/victoire.js";
import {
    aleaFixe,
    allerA,
    joueurs,
    parRole,
    premierEvenement,
    preparerPartie,
    tousParRole,
} from "./aide.js";

describe("ouverture de la partie", () => {
    it("donne un role a chaque joueur et previent chacun en prive", () => {
        const partie = creerPartie("ABCD");
        for (const nom of ["Ana", "Bob", "Cid", "Dea", "Eve"]) ajouterJoueur(partie, nom);

        const resultat = lancerPartie(
            partie,
            { "loup-garou": 1, voyante: 1, sorciere: 1, villageois: 2 },
            aleaFixe(3)
        );

        assert.ok(resultat.ok, resultat.erreur);
        assert.equal(joueurs(partie).filter((j) => j.role !== null).length, 5);

        const attributions = resultat.evenements.filter((e) => e.type === "role-attribue");
        assert.equal(attributions.length, 5);
        for (const evenement of attributions) {
            assert.equal(evenement.visibilite, "privee");
            assert.deepEqual(evenement.destinataires, [evenement.joueurId]);
        }
    });

    it("fait connaitre la meute aux loups, et a eux seuls", () => {
        const partie = creerPartie("ABCD");
        for (const nom of ["Ana", "Bob", "Cid", "Dea", "Eve", "Fay"]) ajouterJoueur(partie, nom);

        const resultat = lancerPartie(
            partie,
            { "loup-garou": 2, voyante: 1, villageois: 3 },
            aleaFixe(9)
        );

        const meute = premierEvenement(resultat.evenements, "meute");
        assert.equal(meute.visibilite, "privee");
        assert.equal(meute.destinataires.length, 2);
        assert.equal(meute.loups.length, 2);
        for (const id of meute.destinataires) {
            assert.equal(partie.joueurs.get(id).role, "loup-garou");
        }
    });

    it("refuse une composition qui ne colle pas au nombre de joueurs", () => {
        const partie = creerPartie("ABCD");
        for (const nom of ["Ana", "Bob", "Cid", "Dea"]) ajouterJoueur(partie, nom);
        const resultat = lancerPartie(partie, { "loup-garou": 1, villageois: 1 }, aleaFixe());
        assert.equal(resultat.ok, false);
        assert.match(resultat.erreur, /2 roles pour 4 joueurs/);
    });

    it("refuse d'etre lancee deux fois", () => {
        const partie = creerPartie("ABCD");
        for (const nom of ["Ana", "Bob", "Cid", "Dea"]) ajouterJoueur(partie, nom);
        const composition = { "loup-garou": 1, voyante: 1, villageois: 2 };
        assert.ok(lancerPartie(partie, composition, aleaFixe()).ok);
        const seconde = lancerPartie(partie, composition, aleaFixe());
        assert.equal(seconde.ok, false);
    });
});

describe("deroulement de la nuit", () => {
    it("appelle les roles dans l'ordre : cupidon, voyante, loups, sorciere", () => {
        const partie = preparerPartie([
            "loup-garou", "loup-garou", "voyante", "sorciere", "cupidon", "villageois", "villageois",
        ]);

        const ordre = [etapeCourante(partie).id];
        for (let i = 0; i < 3; i += 1) {
            avancer(partie);
            const etape = etapeCourante(partie);
            if (etape) ordre.push(etape.id);
        }

        assert.deepEqual(ordre, [
            ETAPES_NUIT.CUPIDON,
            ETAPES_NUIT.VOYANTE,
            ETAPES_NUIT.LOUPS,
            ETAPES_NUIT.SORCIERE,
        ]);
    });

    it("n'appelle plus cupidon des la deuxieme nuit", () => {
        const partie = preparerPartie([
            "loup-garou", "voyante", "cupidon", "villageois", "villageois",
        ]);
        assert.equal(etapeCourante(partie).id, ETAPES_NUIT.CUPIDON);

        // On traverse la nuit 1 puis le jour 1 sans rien faire.
        while (partie.phase === PHASES.NUIT) avancer(partie);
        assert.equal(partie.phase, PHASES.JOUR);
        avancer(partie); // personne n'a vote : on repart en nuit

        assert.equal(partie.tour, 2);
        assert.equal(etapeCourante(partie).id, ETAPES_NUIT.VOYANTE);
    });

    it("saute l'etape d'un role dont plus personne n'est vivant", () => {
        const partie = preparerPartie([
            "loup-garou", "voyante", "sorciere", "villageois", "villageois",
        ]);
        parRole(partie, "voyante").vivant = false;

        // On relance une nuit pour reconstruire les etapes.
        while (partie.phase === PHASES.NUIT) avancer(partie);
        avancer(partie);

        const ids = partie.etapes.map((e) => e.id);
        assert.ok(!ids.includes(ETAPES_NUIT.VOYANTE));
        assert.ok(ids.includes(ETAPES_NUIT.LOUPS));
    });
});

describe("vote des loups", () => {
    it("devore la cible choisie a la majorite", () => {
        const partie = preparerPartie([
            "loup-garou", "loup-garou", "villageois", "villageois", "villageois",
        ]);
        allerA(partie, ETAPES_NUIT.LOUPS);

        const [loupA, loupB] = tousParRole(partie, "loup-garou");
        const victime = parRole(partie, "villageois");

        assert.ok(voterLoup(partie, loupA.id, victime.id).ok);
        assert.ok(voterLoup(partie, loupB.id, victime.id).ok);

        const resultat = avancer(partie);
        const mort = premierEvenement(resultat.evenements, "mort");
        assert.equal(mort.joueurId, victime.id);
        assert.equal(mort.cause, "loups");
        assert.equal(victime.vivant, false);
    });

    it("ne mange personne quand la meute est a egalite", () => {
        const partie = preparerPartie([
            "loup-garou", "loup-garou", "villageois", "villageois", "villageois",
        ]);
        allerA(partie, ETAPES_NUIT.LOUPS);

        const [loupA, loupB] = tousParRole(partie, "loup-garou");
        const [cibleA, cibleB] = tousParRole(partie, "villageois");

        voterLoup(partie, loupA.id, cibleA.id);
        voterLoup(partie, loupB.id, cibleB.id);

        const resultat = avancer(partie);
        assert.ok(premierEvenement(resultat.evenements, "aucune-mort"));
        assert.equal(cibleA.vivant, true);
        assert.equal(cibleB.vivant, true);
    });

    it("interdit a un loup de designer un autre loup", () => {
        const partie = preparerPartie([
            "loup-garou", "loup-garou", "villageois", "villageois", "villageois",
        ]);
        allerA(partie, ETAPES_NUIT.LOUPS);
        const [loupA, loupB] = tousParRole(partie, "loup-garou");

        const resultat = voterLoup(partie, loupA.id, loupB.id);
        assert.equal(resultat.ok, false);
        assert.match(resultat.erreur, /ne se devorent pas/);
    });

    it("interdit a un villageois de voter avec les loups", () => {
        const partie = preparerPartie([
            "loup-garou", "loup-garou", "villageois", "villageois", "villageois",
        ]);
        allerA(partie, ETAPES_NUIT.LOUPS);
        const villageois = parRole(partie, "villageois");

        const resultat = voterLoup(partie, villageois.id, tousParRole(partie, "loup-garou")[0].id);
        assert.equal(resultat.ok, false);
    });

    it("ne communique le decompte qu'aux loups", () => {
        const partie = preparerPartie([
            "loup-garou", "loup-garou", "villageois", "villageois", "villageois",
        ]);
        allerA(partie, ETAPES_NUIT.LOUPS);
        const [loupA, loupB] = tousParRole(partie, "loup-garou");
        const victime = parRole(partie, "villageois");

        const resultat = voterLoup(partie, loupA.id, victime.id);
        const evenement = premierEvenement(resultat.evenements, "votes-loups");
        assert.equal(evenement.visibilite, "privee");
        assert.deepEqual([...evenement.destinataires].sort(), [loupA.id, loupB.id].sort());
    });
});

describe("voyante", () => {
    it("revele le role de sa cible, a elle seule", () => {
        const partie = preparerPartie([
            "loup-garou", "voyante", "villageois", "villageois", "villageois",
        ]);
        allerA(partie, ETAPES_NUIT.VOYANTE);

        const voyante = parRole(partie, "voyante");
        const loup = parRole(partie, "loup-garou");

        const resultat = actionVoyante(partie, voyante.id, loup.id);
        const revelation = premierEvenement(resultat.evenements, "voyante-resultat");
        assert.equal(revelation.role, "loup-garou");
        assert.equal(revelation.visibilite, "privee");
        assert.deepEqual(revelation.destinataires, [voyante.id]);
    });

    it("ne laisse consulter qu'une fois par nuit", () => {
        const partie = preparerPartie([
            "loup-garou", "voyante", "villageois", "villageois", "villageois",
        ]);
        allerA(partie, ETAPES_NUIT.VOYANTE);

        const voyante = parRole(partie, "voyante");
        const [ciblea, cibleb] = tousParRole(partie, "villageois");

        assert.ok(actionVoyante(partie, voyante.id, ciblea.id).ok);
        const seconde = actionVoyante(partie, voyante.id, cibleb.id);
        assert.equal(seconde.ok, false);
        assert.match(seconde.erreur, /deja consulte/);
    });

    it("rend la consultation a la nuit suivante", () => {
        const partie = preparerPartie([
            "loup-garou", "voyante", "villageois", "villageois", "villageois",
        ]);
        allerA(partie, ETAPES_NUIT.VOYANTE);
        const voyante = parRole(partie, "voyante");
        actionVoyante(partie, voyante.id, parRole(partie, "villageois").id);

        while (partie.phase === PHASES.NUIT) avancer(partie);
        avancer(partie); // jour sans vote → nuit 2
        allerA(partie, ETAPES_NUIT.VOYANTE);

        assert.equal(partie.voyanteAJoue, false);
        assert.ok(actionVoyante(partie, voyante.id, parRole(partie, "loup-garou").id).ok);
    });

    it("refuse d'agir hors de son tour", () => {
        const partie = preparerPartie([
            "loup-garou", "loup-garou", "voyante", "villageois", "villageois", "villageois",
        ]);
        allerA(partie, ETAPES_NUIT.LOUPS);
        const voyante = parRole(partie, "voyante");
        const resultat = actionVoyante(partie, voyante.id, parRole(partie, "villageois").id);
        assert.equal(resultat.ok, false);
        assert.match(resultat.erreur, /pas votre tour/);
    });
});

describe("sorciere", () => {
    function partieAvecSorciere() {
        const partie = preparerPartie([
            "loup-garou", "sorciere", "villageois", "villageois", "villageois",
        ]);
        allerA(partie, ETAPES_NUIT.LOUPS);
        const loup = parRole(partie, "loup-garou");
        const victime = tousParRole(partie, "villageois")[0];
        voterLoup(partie, loup.id, victime.id);
        avancer(partie); // on passe a l'etape sorciere
        return { partie, victime, sorciere: parRole(partie, "sorciere") };
    }

    it("sauve la victime des loups avec l'antidote", () => {
        const { partie, victime, sorciere } = partieAvecSorciere();
        assert.equal(etapeCourante(partie).id, ETAPES_NUIT.SORCIERE);

        assert.ok(actionSorciere(partie, sorciere.id, { antidote: true }).ok);
        const resultat = avancer(partie);

        assert.equal(victime.vivant, true);
        assert.ok(premierEvenement(resultat.evenements, "aucune-mort"));
        assert.equal(partie.potions.vie, false);
    });

    it("ne laisse filtrer aucun indice sur le sauvetage", () => {
        const { partie, sorciere } = partieAvecSorciere();
        actionSorciere(partie, sorciere.id, { antidote: true });
        const resultat = avancer(partie);

        const publics = resultat.evenements.filter((e) => e.visibilite === "publique");
        assert.ok(!publics.some((e) => e.type === "mort"));
        assert.ok(!publics.some((e) => /sauv/.test(e.type)));
    });

    it("empoisonne une autre cible la meme nuit", () => {
        const { partie, victime, sorciere } = partieAvecSorciere();
        const autre = tousParRole(partie, "villageois").find((j) => j.id !== victime.id);

        assert.ok(actionSorciere(partie, sorciere.id, { antidote: true, ciblePoison: autre.id }).ok);
        const resultat = avancer(partie);

        assert.equal(victime.vivant, true);
        assert.equal(autre.vivant, false);
        assert.equal(
            resultat.evenements.find((e) => e.type === "mort" && e.joueurId === autre.id).cause,
            "poison"
        );
        assert.deepEqual(partie.potions, { vie: false, mort: false });
    });

    it("refuse une potion deja consommee", () => {
        const { partie, sorciere } = partieAvecSorciere();
        actionSorciere(partie, sorciere.id, { antidote: true });
        partie.potions.vie = false;

        // Nuit suivante : l'antidote n'est plus disponible.
        while (partie.phase === PHASES.NUIT) avancer(partie);
        avancer(partie);
        allerA(partie, ETAPES_NUIT.LOUPS);
        voterLoup(partie, parRole(partie, "loup-garou").id, tousParRole(partie, "villageois")[0].id);
        avancer(partie);

        const resultat = actionSorciere(partie, sorciere.id, { antidote: true });
        assert.equal(resultat.ok, false);
        assert.match(resultat.erreur, /deja consomme/);
    });

    it("refuse d'agir deux fois dans la meme nuit", () => {
        const { partie, sorciere } = partieAvecSorciere();
        assert.ok(actionSorciere(partie, sorciere.id, { antidote: true }).ok);
        const seconde = actionSorciere(partie, sorciere.id, { ciblePoison: parRole(partie, "loup-garou").id });
        assert.equal(seconde.ok, false);
    });

    it("refuse d'empoisonner la victime deja designee par les loups", () => {
        const { partie, victime, sorciere } = partieAvecSorciere();
        const resultat = actionSorciere(partie, sorciere.id, { ciblePoison: victime.id });
        assert.equal(resultat.ok, false);
    });
});

describe("cupidon et les amoureux", () => {
    it("entraine le partenaire dans la mort", () => {
        const partie = preparerPartie([
            "loup-garou", "loup-garou", "cupidon", "villageois", "villageois", "villageois", "villageois",
        ]);
        allerA(partie, ETAPES_NUIT.CUPIDON);

        const cupidon = parRole(partie, "cupidon");
        const [amoureuxA, amoureuxB] = tousParRole(partie, "villageois");
        assert.ok(actionCupidon(partie, cupidon.id, [amoureuxA.id, amoureuxB.id]).ok);

        allerA(partie, ETAPES_NUIT.LOUPS);
        const [loupA, loupB] = tousParRole(partie, "loup-garou");
        voterLoup(partie, loupA.id, amoureuxA.id);
        voterLoup(partie, loupB.id, amoureuxA.id);

        const resultat = avancer(partie);
        assert.equal(amoureuxA.vivant, false);
        assert.equal(amoureuxB.vivant, false);
        assert.equal(
            resultat.evenements.find((e) => e.type === "mort" && e.joueurId === amoureuxB.id).cause,
            "chagrin"
        );
    });

    it("previent chaque amoureux du nom de l'autre, en prive", () => {
        const partie = preparerPartie([
            "loup-garou", "cupidon", "villageois", "villageois", "villageois",
        ]);
        allerA(partie, ETAPES_NUIT.CUPIDON);

        const cupidon = parRole(partie, "cupidon");
        const [a, b] = tousParRole(partie, "villageois");
        const resultat = actionCupidon(partie, cupidon.id, [a.id, b.id]);

        const annonces = resultat.evenements.filter((e) => e.type === "amoureux");
        assert.equal(annonces.length, 2);
        assert.ok(annonces.every((e) => e.visibilite === "privee"));
        assert.equal(annonces.find((e) => e.destinataires[0] === a.id).pseudo, b.pseudo);
        assert.equal(annonces.find((e) => e.destinataires[0] === b.id).pseudo, a.pseudo);
    });

    it("refuse de lier deux fois le meme joueur", () => {
        const partie = preparerPartie(["loup-garou", "cupidon", "villageois", "villageois"]);
        allerA(partie, ETAPES_NUIT.CUPIDON);
        const cupidon = parRole(partie, "cupidon");
        const villageois = parRole(partie, "villageois");
        const resultat = actionCupidon(partie, cupidon.id, [villageois.id, villageois.id]);
        assert.equal(resultat.ok, false);
    });

    it("donne la victoire au couple reste seul, contre les deux camps", () => {
        const partie = preparerPartie([
            "loup-garou", "cupidon", "villageois", "villageois",
        ]);
        allerA(partie, ETAPES_NUIT.CUPIDON);

        const cupidon = parRole(partie, "cupidon");
        const loup = parRole(partie, "loup-garou");
        const [villageoisA, villageoisB] = tousParRole(partie, "villageois");
        actionCupidon(partie, cupidon.id, [loup.id, villageoisA.id]);

        // Le maitre du jeu elimine les deux joueurs hors couple.
        tuerParMj(partie, cupidon.id);
        const resultat = tuerParMj(partie, villageoisB.id);

        const victoire = premierEvenement(resultat.evenements, "victoire");
        assert.equal(victoire.camp, CAMPS_VICTORIEUX.AMOUREUX);
        assert.equal(partie.phase, PHASES.TERMINEE);
    });
});

describe("chasseur", () => {
    it("tire en mourant et suspend la resolution le temps de viser", () => {
        const partie = preparerPartie([
            "loup-garou", "loup-garou", "chasseur", "villageois", "villageois", "villageois", "villageois",
        ]);
        allerA(partie, ETAPES_NUIT.LOUPS);

        const chasseur = parRole(partie, "chasseur");
        const [loupA, loupB] = tousParRole(partie, "loup-garou");
        voterLoup(partie, loupA.id, chasseur.id);
        voterLoup(partie, loupB.id, chasseur.id);

        const resultat = avancer(partie);
        assert.equal(chasseur.vivant, false);
        assert.deepEqual(partie.enAttente, { type: "chasseur", joueurId: chasseur.id });
        assert.equal(partie.phase, PHASES.NUIT, "le jour ne se leve pas tant que le coup n'est pas parti");
        assert.ok(premierEvenement(resultat.evenements, "attente"));

        const tir = actionChasseur(partie, chasseur.id, loupA.id);
        assert.ok(tir.ok);
        assert.equal(loupA.vivant, false);
        assert.equal(partie.phase, PHASES.JOUR, "la nuit se termine une fois le coup parti");
    });

    it("tire aussi quand il meurt de chagrin", () => {
        const partie = preparerPartie([
            "loup-garou", "loup-garou", "cupidon", "chasseur", "villageois", "villageois", "villageois",
        ]);
        allerA(partie, ETAPES_NUIT.CUPIDON);

        const cupidon = parRole(partie, "cupidon");
        const chasseur = parRole(partie, "chasseur");
        const villageois = tousParRole(partie, "villageois")[0];
        actionCupidon(partie, cupidon.id, [chasseur.id, villageois.id]);

        allerA(partie, ETAPES_NUIT.LOUPS);
        const [loupA, loupB] = tousParRole(partie, "loup-garou");
        voterLoup(partie, loupA.id, villageois.id);
        voterLoup(partie, loupB.id, villageois.id);
        avancer(partie);

        assert.equal(villageois.vivant, false, "la victime des loups");
        assert.equal(chasseur.vivant, false, "mort de chagrin");
        assert.deepEqual(partie.enAttente, { type: "chasseur", joueurId: chasseur.id });

        assert.ok(actionChasseur(partie, chasseur.id, loupA.id).ok);
        assert.equal(loupA.vivant, false);
    });

    it("n'accepte le tir que du chasseur concerne", () => {
        const partie = preparerPartie([
            "loup-garou", "loup-garou", "chasseur", "villageois", "villageois", "villageois", "villageois",
        ]);
        const chasseur = parRole(partie, "chasseur");
        const villageois = tousParRole(partie, "villageois")[0];
        tuerParMj(partie, chasseur.id);

        const usurpateur = actionChasseur(partie, villageois.id, tousParRole(partie, "loup-garou")[0].id);
        assert.equal(usurpateur.ok, false);
        assert.deepEqual(partie.enAttente, { type: "chasseur", joueurId: chasseur.id });
    });

    it("peut etre abandonne par le maitre du jeu si le chasseur ne repond pas", () => {
        const partie = preparerPartie([
            "loup-garou", "loup-garou", "chasseur", "villageois", "villageois", "villageois", "villageois",
        ]);
        const chasseur = parRole(partie, "chasseur");
        tuerParMj(partie, chasseur.id);
        assert.ok(partie.enAttente);

        assert.equal(avancer(partie).ok, false, "sans forcer, la partie reste en attente");
        assert.ok(avancer(partie, { forcer: true }).ok);
        assert.equal(partie.enAttente, null);
    });
});

describe("vote du village", () => {
    it("elimine le joueur le plus designe et revele son role", () => {
        const partie = preparerPartie([
            "loup-garou", "villageois", "villageois", "villageois", "villageois",
        ]);
        while (partie.phase === PHASES.NUIT) avancer(partie);

        const loup = parRole(partie, "loup-garou");
        const electeurs = tousParRole(partie, "villageois");
        for (const electeur of electeurs) voterVillage(partie, electeur.id, loup.id);

        const resultat = avancer(partie);
        const mort = premierEvenement(resultat.evenements, "mort");
        assert.equal(mort.joueurId, loup.id);
        assert.equal(mort.role, "loup-garou");
        assert.equal(mort.cause, "vote");
    });

    it("n'elimine personne en cas d'egalite", () => {
        const partie = preparerPartie([
            "loup-garou", "villageois", "villageois", "villageois", "villageois",
        ]);
        while (partie.phase === PHASES.NUIT) avancer(partie);

        const [a, b, c] = tousParRole(partie, "villageois");
        voterVillage(partie, a.id, b.id);
        voterVillage(partie, b.id, a.id);

        const resultat = avancer(partie);
        const resolution = premierEvenement(resultat.evenements, "vote-resolu");
        assert.equal(resolution.elimineId, null);
        assert.equal(resolution.motif, "egalite");
        assert.equal(a.vivant, true);
        assert.equal(b.vivant, true);
        assert.equal(c.vivant, true);
    });

    it("n'elimine personne quand personne ne vote", () => {
        const partie = preparerPartie([
            "loup-garou", "villageois", "villageois", "villageois", "villageois",
        ]);
        while (partie.phase === PHASES.NUIT) avancer(partie);

        const resultat = avancer(partie);
        assert.equal(premierEvenement(resultat.evenements, "vote-resolu").motif, "aucun-vote");
        assert.equal(partie.phase, PHASES.NUIT, "la partie enchaine sur la nuit suivante");
    });

    it("refuse le vote d'un mort et le vote contre soi-meme", () => {
        const partie = preparerPartie([
            "loup-garou", "villageois", "villageois", "villageois", "villageois",
        ]);
        while (partie.phase === PHASES.NUIT) avancer(partie);

        const [a, b] = tousParRole(partie, "villageois");
        assert.equal(voterVillage(partie, a.id, a.id).ok, false);

        a.vivant = false;
        assert.equal(voterVillage(partie, a.id, b.id).ok, false);
    });

    it("refuse le vote pendant la nuit", () => {
        const partie = preparerPartie([
            "loup-garou", "villageois", "villageois", "villageois", "villageois",
        ]);
        const [a, b] = tousParRole(partie, "villageois");
        assert.equal(voterVillage(partie, a.id, b.id).ok, false);
    });
});

describe("conditions de victoire", () => {
    it("le village gagne quand le dernier loup tombe", () => {
        const partie = preparerPartie([
            "loup-garou", "villageois", "villageois", "villageois", "villageois",
        ]);
        const resultat = tuerParMj(partie, parRole(partie, "loup-garou").id);
        const victoire = premierEvenement(resultat.evenements, "victoire");
        assert.equal(victoire.camp, CAMPS_VICTORIEUX.VILLAGE);
        assert.equal(partie.gagnant, CAMPS_VICTORIEUX.VILLAGE);
    });

    it("les loups gagnent des qu'ils egalent le village", () => {
        const partie = preparerPartie([
            "loup-garou", "villageois", "villageois", "villageois",
        ]);
        const [a, b] = tousParRole(partie, "villageois");
        tuerParMj(partie, a.id);
        const resultat = tuerParMj(partie, b.id);
        const victoire = premierEvenement(resultat.evenements, "victoire");
        assert.equal(victoire.camp, CAMPS_VICTORIEUX.LOUPS);
    });

    it("revele tous les roles a la fin", () => {
        const partie = preparerPartie([
            "loup-garou", "voyante", "villageois", "villageois", "villageois",
        ]);
        const resultat = tuerParMj(partie, parRole(partie, "loup-garou").id);
        const victoire = premierEvenement(resultat.evenements, "victoire");
        assert.equal(victoire.revelations.length, 5);
        assert.ok(victoire.revelations.every((r) => r.role !== null));
    });

    it("ne declare rien tant que les deux camps tiennent", () => {
        const partie = preparerPartie([
            "loup-garou", "villageois", "villageois", "villageois", "villageois",
        ]);
        const resultat = tuerParMj(partie, tousParRole(partie, "villageois")[0].id);
        assert.equal(premierEvenement(resultat.evenements, "victoire"), undefined);
        assert.equal(partie.gagnant, null);
    });

    it("cloture la partie : plus aucune action n'est acceptee", () => {
        const partie = preparerPartie([
            "loup-garou", "villageois", "villageois", "villageois", "villageois",
        ]);
        tuerParMj(partie, parRole(partie, "loup-garou").id);
        assert.equal(avancer(partie).ok, false);
    });
});

describe("confidentialite", () => {
    it("annonce l'etape a tous sans reveler qui se reveille", () => {
        const partie = preparerPartie([
            "loup-garou", "voyante", "sorciere", "villageois", "villageois",
        ]);
        const annonce = premierEvenement(partie.historique, "etape");
        assert.equal(annonce.visibilite, "publique");
        assert.equal(annonce.etape, ETAPES_NUIT.VOYANTE);
        assert.equal(annonce.acteurs, undefined, "la liste des acteurs ne doit pas etre publique");
    });

    it("previent en prive le seul joueur dont c'est le tour", () => {
        const partie = preparerPartie([
            "loup-garou", "voyante", "sorciere", "villageois", "villageois",
        ]);
        const convocation = premierEvenement(partie.historique, "votre-tour");
        assert.equal(convocation.visibilite, "privee");
        assert.deepEqual(convocation.destinataires, [parRole(partie, "voyante").id]);
    });

    it("reveille la petite-fille pendant le tour des loups, et elle seule", () => {
        const partie = preparerPartie([
            "loup-garou", "loup-garou", "petite-fille", "villageois", "villageois", "villageois",
        ]);
        allerA(partie, ETAPES_NUIT.LOUPS);

        const espionnage = premierEvenement(partie.historique, "espionner");
        assert.equal(espionnage.visibilite, "privee");
        assert.deepEqual(espionnage.destinataires, [parRole(partie, "petite-fille").id]);
    });

    it("ne publie jamais le role d'un joueur encore en vie", () => {
        const partie = preparerPartie([
            "loup-garou", "loup-garou", "voyante", "sorciere", "cupidon", "chasseur",
            "petite-fille", "villageois", "villageois",
        ]);

        // Une nuit complete, avec toutes les actions possibles.
        const cupidon = parRole(partie, "cupidon");
        const [villageoisA, villageoisB] = tousParRole(partie, "villageois");
        actionCupidon(partie, cupidon.id, [villageoisA.id, villageoisB.id]);
        allerA(partie, ETAPES_NUIT.VOYANTE);
        actionVoyante(partie, parRole(partie, "voyante").id, parRole(partie, "loup-garou").id);
        allerA(partie, ETAPES_NUIT.LOUPS);
        const [loupA, loupB] = tousParRole(partie, "loup-garou");
        voterLoup(partie, loupA.id, villageoisA.id);
        voterLoup(partie, loupB.id, villageoisA.id);
        allerA(partie, ETAPES_NUIT.SORCIERE);
        actionSorciere(partie, parRole(partie, "sorciere").id, { antidote: true });
        avancer(partie);

        const vivants = joueurs(partie).filter((j) => j.vivant);
        const publics = JSON.stringify(partie.historique.filter((e) => e.visibilite === "publique"));

        for (const vivant of vivants) {
            assert.ok(
                !publics.includes(`"${vivant.id}"`) || vivant.role === null,
                `l'identifiant de ${vivant.pseudo} (${vivant.role}) fuite dans un evenement public`
            );
        }
    });
});
