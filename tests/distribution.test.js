import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CAMPS, campDe } from "../public/js/partage/roles.js";
import {
    compositionAutomatique,
    melanger,
    tirerRoles,
    totalComposition,
    validerComposition,
} from "../src/game/distribution.js";
import { aleaFixe } from "./aide.js";

describe("composition automatique", () => {
    it("distribue exactement un role par joueur, de 4 a 20 joueurs", () => {
        for (let nb = 4; nb <= 20; nb += 1) {
            const composition = compositionAutomatique(nb);
            assert.equal(
                totalComposition(composition),
                nb,
                `composition invalide pour ${nb} joueurs : ${JSON.stringify(composition)}`
            );
        }
    });

    it("produit toujours une composition jouable", () => {
        for (let nb = 4; nb <= 20; nb += 1) {
            const erreurs = validerComposition(compositionAutomatique(nb), nb);
            assert.deepEqual(erreurs, [], `${nb} joueurs : ${erreurs.join(" ")}`);
        }
    });

    it("fait grandir la meute avec le village", () => {
        assert.equal(compositionAutomatique(5)["loup-garou"], 1);
        assert.equal(compositionAutomatique(8)["loup-garou"], 2);
        assert.equal(compositionAutomatique(11)["loup-garou"], 3);
        assert.equal(compositionAutomatique(15)["loup-garou"], 4);
    });
});

describe("validation d'une composition", () => {
    it("refuse un total qui ne correspond pas au nombre de joueurs", () => {
        const erreurs = validerComposition({ "loup-garou": 1, villageois: 2 }, 5);
        assert.equal(erreurs.length, 1);
        assert.match(erreurs[0], /3 rôles pour 5 joueurs/);
    });

    it("refuse une partie sans loup", () => {
        const erreurs = validerComposition({ villageois: 4 }, 4);
        assert.ok(erreurs.some((e) => /au moins un loup/.test(e)));
    });

    it("refuse deux exemplaires d'un role unique", () => {
        const erreurs = validerComposition({ "loup-garou": 1, voyante: 2, villageois: 1 }, 4);
        assert.ok(erreurs.some((e) => /qu'un seul Voyante/.test(e)));
    });

    it("refuse une partie deja perdue au lancement", () => {
        const erreurs = validerComposition({ "loup-garou": 2, villageois: 2 }, 4);
        assert.ok(erreurs.some((e) => /aussi nombreux/.test(e)));
    });

    it("refuse un role inconnu", () => {
        const erreurs = validerComposition({ "loup-garou": 1, dragon: 3 }, 4);
        assert.ok(erreurs.some((e) => /Rôle inconnu/.test(e)));
    });

    it("accepte une composition correcte", () => {
        const erreurs = validerComposition(
            { "loup-garou": 2, voyante: 1, sorciere: 1, chasseur: 1, villageois: 2 },
            7
        );
        assert.deepEqual(erreurs, []);
    });
});

describe("tirage des roles", () => {
    it("rend autant de roles que la composition en annonce", () => {
        const composition = { "loup-garou": 2, voyante: 1, villageois: 4 };
        const tirage = tirerRoles(composition, aleaFixe());
        assert.equal(tirage.length, 7);
        assert.equal(tirage.filter((r) => r === "loup-garou").length, 2);
        assert.equal(tirage.filter((r) => r === "voyante").length, 1);
        assert.equal(tirage.filter((r) => r === "villageois").length, 4);
    });

    it("ne perd aucun element au melange", () => {
        const depart = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const melange = melanger(depart, aleaFixe(7));
        assert.deepEqual([...melange].sort((a, b) => a - b), depart);
        assert.deepEqual(depart, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "le tableau d'origine ne doit pas bouger");
    });

    it("repartit les positions de maniere homogene sur un grand nombre de tirages", () => {
        // Le melange naif `sort(() => Math.random() - 0.5)` echoue a ce test :
        // il laisse le premier element en tete bien plus souvent qu'un tirage sur N.
        const alea = aleaFixe(1234);
        const positions = new Array(5).fill(0);
        const tirages = 4000;
        for (let i = 0; i < tirages; i += 1) {
            const melange = melanger(["a", "b", "c", "d", "e"], alea);
            positions[melange.indexOf("a")] += 1;
        }
        const attendu = tirages / 5;
        for (const compte of positions) {
            assert.ok(
                Math.abs(compte - attendu) < attendu * 0.2,
                `repartition trop desequilibree : ${positions.join(", ")}`
            );
        }
    });
});

describe("camps", () => {
    it("range le loup-garou du bon cote", () => {
        assert.equal(campDe("loup-garou"), CAMPS.LOUPS);
        assert.equal(campDe("voyante"), CAMPS.VILLAGE);
        assert.equal(campDe("chasseur"), CAMPS.VILLAGE);
    });
});
