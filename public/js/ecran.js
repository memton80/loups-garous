import { nomDe } from "./partage/roles.js";
import { demander, socket } from "./socket.js";
import { $, afficher, creer, messageEclair, parametre, texte, vider } from "./ui.js";

/**
 * Écran de suivi, à projeter pendant la partie.
 *
 * Il n'envoie qu'une seule commande, « suivre », et ne reçoit ensuite que la
 * vue publique — la même que celle des joueurs. Le rôle d'un joueur vivant
 * n'arrive donc jamais jusqu'ici : ce n'est pas l'affichage qui le cache,
 * c'est le serveur qui ne l'envoie pas.
 */

let partie = null;
let code = null;

async function suivre(codeDemande) {
    const reponse = await demander("spectateur:suivre", { code: codeDemande });
    if (!reponse.ok) {
        messageEclair(reponse.erreur, { erreur: true });
        return false;
    }

    code = reponse.partie.code;
    partie = reponse.partie;

    afficher($("#ecran-accueil"), false);
    afficher($("#zone-suivi"), true);
    texte($("#ecran-code"), code);

    vider($("#journal"));
    for (const evenement of reponse.journal) inscrire(evenement);

    rendre();
    return true;
}

// ─── Affichage ───────────────────────────────────────────────────

const LIBELLES_PHASE = {
    attente: "En attente des joueurs",
    nuit: "🌙 La nuit",
    jour: "☀️ Le jour",
    terminee: "Partie terminée",
};

function rendre() {
    if (!partie) return;

    const phase = $("#ecran-phase");
    phase.className = `ecran-phase ${partie.phase}`;
    texte(
        phase,
        partie.phase === "nuit" || partie.phase === "jour"
            ? `${LIBELLES_PHASE[partie.phase]} ${partie.tour}`
            : LIBELLES_PHASE[partie.phase]
    );

    const vivants = partie.joueurs.filter((joueur) => joueur.vivant).length;
    texte(
        $("#titre-village"),
        `Le village — ${vivants} en vie sur ${partie.joueurs.length}`
    );

    const village = $("#village");
    vider(village);

    for (const joueur of partie.joueurs) {
        const classes = ["habitant"];
        if (!joueur.vivant) classes.push("mort");
        if (!joueur.connecte) classes.push("hors-ligne");
        // Le rôle n'arrive qu'une fois le joueur mort ; la teinte suit.
        if (joueur.role) classes.push(`role-${joueur.role}`);

        const carte = creer("div", { classe: classes.join(" ") }, [
            creer("span", { classe: "nom", texte: joueur.pseudo }),
        ]);

        if (joueur.role) {
            carte.append(creer("span", { classe: "role", texte: nomDe(joueur.role) }));
        }
        if (!joueur.connecte) {
            carte.append(creer("span", { classe: "etat", texte: "hors ligne" }));
        }

        village.append(carte);
    }
}

// ─── Chronique ───────────────────────────────────────────────────

const CAUSES = {
    loups: "dévoré par les loups",
    poison: "empoisonné par la sorcière",
    vote: "lynché par le village",
    chagrin: "mort de chagrin",
    chasseur: "abattu par le chasseur",
    mj: "retiré de la partie",
};

function raconter(evenement) {
    switch (evenement.type) {
        case "phase":
            return {
                texte: `— ${evenement.phase === "nuit" ? "Nuit" : "Jour"} ${evenement.tour} —`,
                classe: "phase",
            };
        case "etape":
            return { texte: `${nomDe(evenement.role)}, réveillez-vous.` };
        case "mort":
            return {
                texte: `${evenement.pseudo} (${nomDe(evenement.role)}) a été ${CAUSES[evenement.cause] ?? "éliminé"}.`,
                classe: "mort",
            };
        case "aucune-mort":
            return { texte: "La nuit s'est passée sans victime." };
        case "attente":
            return { texte: `${evenement.pseudo} était le Chasseur. Il arme son fusil…`, classe: "mort" };
        case "tir-chasseur":
            return { texte: `${evenement.pseudo} emporte ${evenement.ciblePseudo} dans sa chute.`, classe: "mort" };
        case "vote-resolu":
            if (evenement.motif === "egalite") return { texte: "Égalité : personne n'est éliminé." };
            if (evenement.motif === "aucun-vote") return { texte: "Aucun vote : personne n'est éliminé." };
            return null;
        case "resurrection":
            return { texte: `${evenement.pseudo} revient parmi les vivants.` };
        case "victoire":
            return { texte: evenement.message, classe: "victoire" };
        default:
            return null;
    }
}

function inscrire(evenement) {
    const ligne = raconter(evenement);
    if (!ligne) return;

    const journal = $("#journal");
    journal.append(creer("p", { classe: ligne.classe ?? "", texte: ligne.texte }));
    journal.scrollTop = journal.scrollHeight;
}

function annoncerVictoire({ camp, message }) {
    const titres = {
        village: "Le village l'emporte",
        loups: "Les loups l'emportent",
        amoureux: "Les amoureux l'emportent",
        personne: "Le village s'est éteint",
    };
    texte($("#victoire-titre"), titres[camp] ?? "Partie terminée");
    texte($("#victoire-message"), message);
    afficher($("#ecran-victoire"), true);
}

// ─── Événements ──────────────────────────────────────────────────

socket.on("partie:etat", (etat) => {
    partie = etat;
    rendre();
});

socket.on("partie:evenement", (evenement) => {
    inscrire(evenement);
    if (evenement.type === "victoire") annoncerVictoire(evenement);
});

socket.on("connect", () => {
    // Après une coupure, l'écran se raccroche tout seul à la partie suivie.
    if (code) suivre(code);
});

socket.on("disconnect", () => messageEclair("Connexion perdue…", { erreur: true }));

// ─── Démarrage ───────────────────────────────────────────────────

$("#bouton-suivre").addEventListener("click", () => {
    const saisi = $("#champ-code").value.trim().toUpperCase();
    if (saisi) suivre(saisi);
});

$("#champ-code").addEventListener("keydown", (evenement) => {
    if (evenement.key === "Enter") $("#bouton-suivre").click();
});

const codeDeLAdresse = parametre("code");
if (codeDeLAdresse) {
    $("#champ-code").value = codeDeLAdresse.toUpperCase();
    suivre(codeDeLAdresse);
}
