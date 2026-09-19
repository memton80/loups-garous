import { ETAPES_NUIT, nomDe, role as ficheRole } from "./partage/roles.js";
import { construirePanneauRoles } from "./panneau-roles.js";
import { demander, memoire, socket } from "./socket.js";
import {
    $,
    afficher,
    creer,
    messageEclair,
    parametre,
    remplirSelect,
    texte,
    vider,
} from "./ui.js";

/**
 * Page du joueur.
 *
 * Le client ne decide de rien : il affiche l'etat que le serveur lui envoie.
 * Deux messages suffisent a tout piloter — « joueur:etat » pour ce qui le
 * concerne seul, « partie:etat » pour ce que tout le monde voit.
 */

const CLE_JETON = "loups-garous:jeton";
const CLE_CODE = "loups-garous:code";

let moi = null;
let partie = null;

// ─── Entree dans la partie ───────────────────────────────────────

async function entrer(donnees) {
    const reponse = await demander("joueur:rejoindre", donnees);

    if (!reponse.ok) {
        // Un jeton perime ne doit pas coller au navigateur pour toujours.
        memoire.effacer(CLE_JETON);
        return reponse;
    }

    memoire.ecrire(CLE_JETON, reponse.jeton);
    memoire.ecrire(CLE_CODE, reponse.partie.code);

    moi = reponse.moi;
    partie = reponse.partie;

    afficher($("#zone-entree"), false);
    afficher($("#zone-jeu"), true);

    vider($("#journal"));
    for (const evenement of reponse.journal) inscrireAuJournal(evenement);

    rendre();
    return reponse;
}

async function entrerDepuisLeFormulaire() {
    const pseudo = $("#champ-pseudo").value.trim();
    const code = $("#champ-code").value.trim().toUpperCase();

    if (!pseudo || !code) {
        messageEclair("Il faut un nom et un code de partie.", { erreur: true });
        return;
    }

    const reponse = await entrer({ code, pseudo });
    if (!reponse.ok) messageEclair(reponse.erreur, { erreur: true });
}

/** Reprise automatique : le jeton garde en memoire suffit a retrouver sa place. */
async function reprendreSiPossible() {
    const jeton = memoire.lire(CLE_JETON);
    const code = parametre("code") ?? memoire.lire(CLE_CODE);
    if (!jeton || !code) {
        if (code) $("#champ-code").value = code;
        return;
    }
    await entrer({ code, jeton });
}

// ─── Affichage ───────────────────────────────────────────────────

function rendre() {
    if (!moi || !partie) return;
    rendreBandeau();
    rendreCarteRole();
    rendreListeJoueurs();
    rendreSelects();
    rendreActions();
}

function rendreBandeau() {
    const bandeau = $("#bandeau-phase");
    bandeau.className = `bandeau-phase ${partie.phase}`;
    $("#pastille-phase").className = "pastille-phase";

    const libelles = {
        attente: "En attente du lancement",
        nuit: `🌙 Nuit ${partie.tour} — le village s'endort`,
        jour: `☀️ Jour ${partie.tour} — le village délibère`,
        terminee: "La partie est terminée",
    };
    texte($("#libelle-phase"), libelles[partie.phase] ?? partie.phase);
}

function rendreCarteRole() {
    const carte = $("#carte-role");
    const fiche = moi.role ? ficheRole(moi.role) : null;

    carte.className = `carte-role${moi.role ? ` role-${moi.role}` : ""}${moi.vivant ? "" : " mort"}`;
    texte($("#role-icone"), fiche?.icone ?? "");
    texte($("#role-nom"), fiche?.nom ?? "—");
    texte(
        $("#role-description"),
        moi.vivant
            ? fiche?.description ?? "En attente de l'attribution des rôles…"
            : "Vous êtes mort. Vous pouvez suivre la partie, mais plus y prendre part."
    );

    afficher($("#carte-amoureux"), Boolean(moi.amoureux));
    if (moi.amoureux) {
        texte($("#texte-amoureux"), `Votre amour : ${moi.amoureux.pseudo}`);
    }
}

function rendreListeJoueurs() {
    const liste = $("#liste-joueurs");
    vider(liste);

    for (const joueur of partie.joueurs) {
        const classes = ["", joueur.vivant ? "" : "mort", joueur.connecte ? "" : "hors-ligne"];
        if (joueur.id === moi.joueurId) classes.push("moi");

        const ligne = creer("li", { classe: classes.filter(Boolean).join(" ") }, [
            creer("span", {
                classe: `pastille-joueur ${joueur.vivant ? "vivant" : "mort"}`,
            }),
            creer("span", {
                classe: "nom-joueur",
                texte: joueur.pseudo + (joueur.id === moi.joueurId ? " (vous)" : ""),
            }),
        ]);

        // Le role d'un mort est revele : c'est la regle du jeu.
        if (!joueur.vivant && joueur.role) {
            ligne.append(creer("span", { classe: "role-revele", texte: nomDe(joueur.role) }));
        }
        liste.append(ligne);
    }
}

/** Joueurs vivants, hors soi-meme sauf mention contraire. */
function cibles({ avecMoi = false } = {}) {
    return partie.joueurs
        .filter((joueur) => joueur.vivant && (avecMoi || joueur.id !== moi.joueurId))
        .map((joueur) => ({
            valeur: joueur.id,
            libelle: joueur.pseudo + (joueur.id === moi.joueurId ? " (vous)" : ""),
        }));
}

function rendreSelects() {
    const vivants = cibles();
    remplirSelect($("#vote-cible"), vivants, { placeholder: "— Choisir —" });
    remplirSelect($("#voyante-cible"), vivants, { placeholder: "— Choisir —" });
    remplirSelect($("#chasseur-cible"), vivants, { placeholder: "— Choisir —" });

    // Les loups ne peuvent pas se devorer entre eux : on retire la meute.
    const idsMeute = new Set((moi.meute ?? []).map((loup) => loup.id));
    remplirSelect(
        $("#loups-cible"),
        vivants.filter((cible) => !idsMeute.has(cible.valeur)),
        { placeholder: "— Choisir —" }
    );

    // La sorciere ne peut pas empoisonner la victime deja designee.
    remplirSelect(
        $("#poison-cible"),
        vivants.filter((cible) => cible.valeur !== moi.victimeDesLoups?.id),
        { placeholder: "— Choisir —" }
    );

    const tous = cibles({ avecMoi: true });
    remplirSelect($("#cupidon-premier"), tous, { placeholder: "— Premier —" });
    remplirSelect($("#cupidon-second"), tous, { placeholder: "— Second —" });
}

const PANNEAUX = {
    [ETAPES_NUIT.CUPIDON]: "#action-cupidon",
    [ETAPES_NUIT.VOYANTE]: "#action-voyante",
    [ETAPES_NUIT.LOUPS]: "#action-loups",
    [ETAPES_NUIT.SORCIERE]: "#action-sorciere",
};

function rendreActions() {
    for (const selecteur of Object.values(PANNEAUX)) afficher($(selecteur), false);
    afficher($("#action-petite-fille"), false);
    afficher($("#action-chasseur"), false);
    afficher($("#zone-vote"), false);
    afficher($("#appel"), false);

    if (partie.phase === "terminee") return;

    // Le tir du chasseur passe avant tout le reste : la partie l'attend.
    if (moi.doitTirer) {
        afficher($("#action-chasseur"), true);
        annoncerAppel("À vous de tirer");
        return;
    }

    if (!moi.vivant) return;

    if (partie.phase === "jour") {
        afficher($("#zone-vote"), true);
        return;
    }

    if (moi.epie) {
        afficher($("#action-petite-fille"), true);
        annoncerAppel("Les loups se réveillent");
    }

    if (!moi.monTour) return;

    const panneau = PANNEAUX[moi.etape];
    if (!panneau) return;

    afficher($(panneau), true);
    annoncerAppel(`C'est votre tour — ${nomDe(moi.role)}`);

    if (moi.etape === ETAPES_NUIT.SORCIERE) rendreSorciere();
    if (moi.aDejaAgi) verrouillerPanneau(panneau);
}

function annoncerAppel(message) {
    const appel = $("#appel");
    appel.className = `appel${moi.role ? ` role-${moi.role}` : ""}`;
    texte($("#appel-texte"), message);
    afficher(appel, true);
}

function rendreSorciere() {
    const victime = moi.victimeDesLoups;
    texte(
        $("#sorciere-victime"),
        victime ? `Les loups ont attaqué : ${victime.pseudo}` : "Les loups n'ont fait aucune victime cette nuit."
    );

    const antidoteDisponible = Boolean(moi.potions?.vie) && Boolean(victime);
    afficher($("#bouton-antidote"), antidoteDisponible);
    afficher($("#antidote-epuise"), !moi.potions?.vie);

    const poisonDisponible = Boolean(moi.potions?.mort);
    afficher($("#poison-cible"), poisonDisponible);
    afficher($("#bouton-poison"), poisonDisponible);
    afficher($("#poison-epuise"), !poisonDisponible);
}

/** Une fois l'action jouee, on grise le panneau sans le faire disparaitre. */
function verrouillerPanneau(selecteur) {
    for (const controle of $(selecteur).querySelectorAll("button, select")) {
        controle.disabled = true;
    }
}

// ─── Journal ─────────────────────────────────────────────────────

/**
 * Chaque cause porte la fin de phrase complete, verbe compris : « mort de
 * chagrin » ne se construit pas comme « devore par les loups », et un seul
 * gabarit « a ete … » produisait « a ete mort de chagrin ».
 */
const CAUSES = {
    loups: "a été dévoré par les loups",
    poison: "a été empoisonné par la sorcière",
    vote: "a été lynché par le village",
    chagrin: "est mort de chagrin",
    chasseur: "a été abattu par le chasseur",
    mj: "a été retiré de la partie",
};

/** Traduit un evenement du serveur en une ligne de journal. */
function formuler(evenement) {
    switch (evenement.type) {
        case "phase":
            return evenement.phase === "nuit"
                ? { texte: `— Nuit ${evenement.tour} —`, classe: "phase" }
                : { texte: `— Jour ${evenement.tour} —`, classe: "phase" };

        case "etape":
            return { texte: `Le maître du jeu appelle : ${nomDe(evenement.role)}.` };

        case "votre-tour":
            return { texte: "C'est votre tour.", classe: "secret" };

        case "espionner":
            return { texte: "Vous entrouvrez un œil sur la meute…", classe: "secret" };

        case "meute":
            return {
                texte: `Vos congénères : ${evenement.loups.map((loup) => loup.pseudo).join(", ")}.`,
                classe: "secret",
            };

        case "amoureux":
            return { texte: `💞 Vous êtes amoureux de ${evenement.pseudo}.`, classe: "secret" };

        case "voyante-resultat":
            return { texte: `🔮 ${evenement.pseudo} est ${nomDe(evenement.role)}.`, classe: "secret" };

        case "loups-indecis":
            return { texte: "La meute ne s'est pas entendue : personne n'a été dévoré.", classe: "secret" };

        case "mort":
            return {
                texte: `${evenement.pseudo} (${nomDe(evenement.role)}) ${CAUSES[evenement.cause] ?? "a été éliminé"}.`,
                classe: "mort",
            };

        case "aucune-mort":
            return { texte: "La nuit s'est passée sans victime." };

        case "attente":
            return { texte: `${evenement.pseudo} était le Chasseur. Il arme son fusil…`, classe: "mort" };

        case "tir-chasseur":
            return { texte: `🏹 ${evenement.pseudo} emporte ${evenement.ciblePseudo} dans sa chute.`, classe: "mort" };

        case "vote-resolu":
            if (evenement.motif === "egalite") return { texte: "Égalité : personne n'est éliminé." };
            if (evenement.motif === "aucun-vote") return { texte: "Aucun vote : personne n'est éliminé." };
            return null; // l'elimination est deja racontee par l'evenement « mort »

        case "resurrection":
            return { texte: `${evenement.pseudo} revient parmi les vivants.` };

        case "victoire":
            return { texte: evenement.message, classe: "victoire" };

        default:
            return null;
    }
}

function inscrireAuJournal(evenement) {
    const ligne = formuler(evenement);
    if (!ligne) return;

    const journal = $("#journal");
    const vide = journal.querySelector(".journal-vide");
    if (vide) vide.remove();

    journal.append(creer("p", { classe: ligne.classe ?? "", texte: ligne.texte }));
    journal.scrollTop = journal.scrollHeight;
}

// ─── Reception des evenements ────────────────────────────────────

socket.on("joueur:etat", (etat) => {
    moi = etat;
    rendre();
});

socket.on("partie:etat", (etat) => {
    partie = etat;
    rendre();
});

socket.on("partie:evenement", (evenement) => {
    inscrireAuJournal(evenement);

    if (evenement.type === "voyante-resultat") {
        const boite = $("#voyante-revelation");
        texte(boite, `${evenement.pseudo} est ${nomDe(evenement.role)}`);
        afficher(boite, true);
    }

    if (evenement.type === "meute") {
        const zone = $("#meute");
        vider(zone);
        for (const loup of evenement.loups) {
            zone.append(creer("span", { texte: loup.pseudo }));
        }
    }

    if (evenement.type === "votes-loups") rendreDecompte("#loups-decompte", evenement);
    if (evenement.type === "votes-village") rendreDecompte("#vote-decompte", evenement);

    if (evenement.type === "votes-loups") {
        texte($("#loups-etat"), `${evenement.votants.length} loup(s) sur ${evenement.total} ont choisi.`);
    }

    if (evenement.type === "victoire") annoncerVictoire(evenement);
    if (evenement.type === "etape") afficher($("#voyante-revelation"), false);
});

socket.on("joueur:ejecte", ({ motif }) => {
    memoire.effacer(CLE_JETON);
    memoire.effacer(CLE_CODE);
    texte($("#motif-ejection"), motif ?? "Vous ne faites plus partie de cette partie.");
    afficher($("#modale-ejecte"), true);
});

socket.on("disconnect", () => messageEclair("Connexion perdue, tentative de reprise…", { erreur: true }));
socket.on("connect", () => {
    // Une coupure de Wi-Fi ne doit pas obliger a ressaisir son nom.
    if (moi) reprendreSiPossible();
});

function rendreDecompte(selecteur, { comptes }) {
    const zone = $(selecteur);
    vider(zone);

    for (const [cibleId, nombre] of comptes) {
        const joueur = partie?.joueurs.find((candidat) => candidat.id === cibleId);
        zone.append(
            creer("span", {
                texte: `${joueur?.pseudo ?? "?"} : ${nombre} voix`,
            })
        );
    }
}

function annoncerVictoire({ camp, message, revelations }) {
    const titres = {
        village: "Le village l'emporte",
        loups: "Les loups l'emportent",
        amoureux: "Les amoureux l'emportent",
        personne: "Le village s'est éteint",
    };

    texte($("#victoire-titre"), titres[camp] ?? "Partie terminée");
    texte($("#victoire-message"), message);

    const corps = $("#victoire-revelations");
    vider(corps);
    for (const joueur of revelations) {
        corps.append(
            creer("tr", {}, [
                creer("td", { texte: joueur.pseudo + (joueur.vivant ? "" : " ☠") }),
                creer("td", { texte: nomDe(joueur.role) }),
            ])
        );
    }

    afficher($("#annonce-victoire"), true);
}

// ─── Actions du joueur ───────────────────────────────────────────

/** Envoie une action et signale l'echec sans casser l'affichage. */
async function envoyer(evenement, donnees, succes) {
    const reponse = await demander(evenement, donnees);
    if (!reponse.ok) return messageEclair(reponse.erreur, { erreur: true });
    if (succes) messageEclair(succes);
}

function valeur(selecteur) {
    const choix = $(selecteur).value;
    if (!choix) {
        messageEclair("Choisissez d'abord un joueur.", { erreur: true });
        return null;
    }
    return choix;
}

$("#bouton-entrer").addEventListener("click", entrerDepuisLeFormulaire);
$("#champ-code").addEventListener("keydown", (evenement) => {
    if (evenement.key === "Enter") entrerDepuisLeFormulaire();
});

$("#bouton-loups").addEventListener("click", () => {
    const cibleId = valeur("#loups-cible");
    if (cibleId) envoyer("joueur:vote-loup", { cibleId }, "Choix transmis à la meute");
});

$("#bouton-voyante").addEventListener("click", () => {
    const cibleId = valeur("#voyante-cible");
    if (cibleId) envoyer("joueur:voyante", { cibleId });
});

$("#bouton-antidote").addEventListener("click", () =>
    envoyer("joueur:sorciere", { antidote: true }, "Antidote utilisé")
);

$("#bouton-poison").addEventListener("click", () => {
    const ciblePoison = valeur("#poison-cible");
    if (ciblePoison) envoyer("joueur:sorciere", { ciblePoison }, "Poison utilisé");
});

$("#bouton-passer-sorciere").addEventListener("click", () =>
    envoyer("joueur:sorciere", {}, "Tour passé")
);

$("#bouton-cupidon").addEventListener("click", () => {
    const premier = $("#cupidon-premier").value;
    const second = $("#cupidon-second").value;
    if (!premier || !second) {
        return messageEclair("Choisissez deux joueurs.", { erreur: true });
    }
    envoyer("joueur:cupidon", { amoureux: [premier, second] }, "Les amoureux sont liés");
});

$("#bouton-chasseur").addEventListener("click", () => {
    const cibleId = valeur("#chasseur-cible");
    if (cibleId) envoyer("joueur:chasseur", { cibleId });
});

$("#bouton-vote").addEventListener("click", () => {
    const cibleId = valeur("#vote-cible");
    if (cibleId) envoyer("joueur:vote", { cibleId }, "Vote enregistré");
});

// ─── Panneau des rôles ───────────────────────────────────────────

construirePanneauRoles($("#contenu-roles"));

function basculerRoles(ouvert) {
    afficher($("#panneau-roles"), ouvert);
    afficher($("#fermer-roles"), ouvert);
    afficher($("#barre-regles"), !ouvert);
}

$("#ouvrir-roles").addEventListener("click", () => basculerRoles(true));
$("#fermer-roles").addEventListener("click", () => basculerRoles(false));
document.addEventListener("keydown", (evenement) => {
    if (evenement.key === "Escape") basculerRoles(false);
});

// ─── Demarrage ───────────────────────────────────────────────────

const codeDepuisLAdresse = parametre("code");
if (codeDepuisLAdresse) $("#champ-code").value = codeDepuisLAdresse.toUpperCase();

reprendreSiPossible();
