import { ETATS, ROLES } from "./partage/roles.js";
import { creer, vider } from "./ui.js";

/**
 * Panneau « Les roles », construit a partir du catalogue partage avec le
 * serveur. C'est la meme source qui decide des regles du jeu et de ce qui est
 * affiche ici : les deux ne peuvent plus diverger.
 */

const CAMPS_AFFICHES = [
    { id: "village", titre: "⚔ Camp du Village", classe: "camp-village" },
    { id: "loups", titre: "🐺 Camp des Loups", classe: "camp-loups" },
    { id: "solitaire", titre: "🌒 Destins solitaires", classe: "camp-solitaire" },
];

function fiche(role, campLibelle) {
    const entete = creer("div", { classe: "fiche-entete" }, [
        creer("div", { classe: "fiche-icone", texte: role.icone }),
        creer("div", {}, [
            creer("div", { classe: "fiche-nom", texte: role.nom }),
            creer("span", { classe: "fiche-camp", texte: campLibelle }),
        ]),
    ]);

    const pouvoirs = role.pouvoirs.map((pouvoir) =>
        creer("div", { classe: "pouvoir" }, [
            creer("p", {}, [creer("strong", { texte: pouvoir.titre }), ` — ${pouvoir.texte}`]),
        ])
    );

    return creer("div", { classe: "fiche-role" }, [
        entete,
        creer("p", { classe: "fiche-texte", texte: role.description }),
        creer("div", { classe: "pouvoirs-titre", texte: "Pouvoirs et regles" }),
        ...pouvoirs,
    ]);
}

function sectionCamp({ id, titre, classe }, roles) {
    const grille = creer("div", { classe: "grille-roles" });
    const zoneFiche = creer("div");
    let actif = null;

    for (const role of roles) {
        const vignette = creer("button", { classe: "vignette-role", attributs: { type: "button" } }, [
            creer("span", { classe: "vignette-icone", texte: role.icone }),
            creer("span", { classe: "vignette-nom", texte: role.nom }),
            creer("span", { classe: "vignette-accroche", texte: role.accroche }),
        ]);

        vignette.addEventListener("click", () => {
            // Un second clic sur la meme vignette referme la fiche.
            if (actif === role.id) {
                vider(zoneFiche);
                vignette.classList.remove("active");
                actif = null;
                return;
            }
            for (const autre of grille.children) autre.classList.remove("active");
            vignette.classList.add("active");
            actif = role.id;
            vider(zoneFiche);
            zoneFiche.append(fiche(role, titre.replace(/^\S+\s/, "")));
        });

        grille.append(vignette);
    }

    return creer("section", { classe: `camp ${classe}` }, [
        creer("h3", { classe: "camp-titre" }, [creer("span", { texte: titre })]),
        grille,
        zoneFiche,
    ]);
}

/** Construit le panneau dans le conteneur donne. */
export function construirePanneauRoles(conteneur) {
    if (!conteneur) return;
    vider(conteneur);

    const catalogue = [...ROLES, ...ETATS];
    for (const camp of CAMPS_AFFICHES) {
        const roles = catalogue.filter((role) => role.camp === camp.id);
        if (roles.length > 0) conteneur.append(sectionCamp(camp, roles));
    }
}
