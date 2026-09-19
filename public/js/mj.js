import { CAMPS, ROLES, nomDe, role as ficheRole } from "./partage/roles.js";
import { demander, socket } from "./socket.js";
import { $, afficher, creer, messageEclair, texte, vider } from "./ui.js";

/**
 * Tableau de bord du maître du jeu.
 *
 * Tout l'affichage est construit par nœuds DOM avec textContent. L'ancienne
 * version assemblait des chaînes HTML contenant les pseudos : un joueur qui
 * s'inscrivait sous le nom « <img src=x onerror=…> » faisait exécuter son
 * code dans le navigateur du maître du jeu.
 */

const CLE_SESSION = "loups-garous:mj";
const MINIMUM_JOUEURS = 4;

/**
 * Compositions en cours d'édition, par code de partie.
 * `auto` reste vrai tant que le maître du jeu n'a rien changé à la main :
 * dans ce cas la répartition se recalcule à chaque arrivée ou départ, au
 * lieu de rester figée sur le nombre de joueurs du moment où elle a été
 * demandée — c'est-à-dire zéro, juste après la création de la partie.
 */
const compositions = new Map();

let parties = [];

// ─── Session ─────────────────────────────────────────────────────

function jetonDeSession() {
    try {
        return window.sessionStorage.getItem(CLE_SESSION);
    } catch {
        return null;
    }
}

function repartirVersLaConnexion() {
    try {
        window.sessionStorage.removeItem(CLE_SESSION);
    } catch {
        /* rien à faire */
    }
    window.location.href = "/mj-connexion.html";
}

async function ouvrirSession() {
    const jeton = jetonDeSession();
    if (!jeton) return repartirVersLaConnexion();

    const reponse = await demander("mj:session", { jeton });
    if (!reponse.ok) repartirVersLaConnexion();
}

// ─── Commandes ───────────────────────────────────────────────────

async function commander(evenement, donnees, succes) {
    const reponse = await demander(evenement, donnees);
    if (!reponse.ok) {
        if (/authentifié/.test(reponse.erreur ?? "")) return repartirVersLaConnexion();
        messageEclair(reponse.erreur, { erreur: true });
        return null;
    }
    if (succes) messageEclair(succes);
    return reponse;
}

// ─── Composition des rôles ───────────────────────────────────────

function compositionDe(partie) {
    const connue = compositions.get(partie.code);
    const aJour = connue && (!connue.auto || connue.pourJoueurs === partie.joueurs.length);
    if (aJour) return connue.composition;

    // Marqueur pour ne pas redemander en boucle pendant que la réponse arrive.
    compositions.set(partie.code, {
        composition: connue?.composition ?? null,
        auto: true,
        pourJoueurs: partie.joueurs.length,
        enAttente: true,
    });

    demander("mj:composition-auto", { code: partie.code }).then((reponse) => {
        const courant = compositions.get(partie.code);
        // Le maître du jeu a pu modifier la composition entre-temps.
        if (!reponse.ok || !courant?.auto) return;
        compositions.set(partie.code, {
            composition: reponse.composition,
            auto: true,
            pourJoueurs: courant.pourJoueurs,
        });
        rendre();
    });

    return connue?.composition ?? null;
}

function totalDe(composition) {
    return Object.values(composition ?? {}).reduce((somme, nombre) => somme + nombre, 0);
}

function ajusterRole(code, roleId, delta) {
    const composition = { ...(compositions.get(code)?.composition ?? {}) };
    const nouveau = (composition[roleId] ?? 0) + delta;

    if (nouveau <= 0) delete composition[roleId];
    else composition[roleId] = nouveau;

    // Dès la première retouche, on cesse de recalculer à sa place.
    compositions.set(code, { composition, auto: false });
    rendre();
}

function construireComposeur(partie) {
    const composition = compositionDe(partie);
    const section = creer("div", { classe: "section-mj" }, [
        creer("h3", { classe: "titre-section", texte: "Composition de la partie" }),
    ]);

    if (!composition) {
        section.append(creer("p", { classe: "carte-aide", texte: "Chargement…" }));
        return section;
    }

    const liste = creer("div", { classe: "composeur" });

    for (const fiche of ROLES) {
        const nombre = composition[fiche.id] ?? 0;
        const maximum = fiche.unique ? 1 : 99;

        const moins = creer("button", { texte: "−", attributs: { type: "button", "aria-label": `Un ${fiche.nom} de moins` } });
        moins.disabled = nombre === 0;
        moins.addEventListener("click", () => ajusterRole(partie.code, fiche.id, -1));

        const plus = creer("button", { texte: "+", attributs: { type: "button", "aria-label": `Un ${fiche.nom} de plus` } });
        plus.disabled = nombre >= maximum;
        plus.addEventListener("click", () => ajusterRole(partie.code, fiche.id, 1));

        liste.append(
            creer("div", { classe: `ligne-role${fiche.camp === CAMPS.LOUPS ? " loups" : ""}` }, [
                creer("span", { classe: "icone", texte: fiche.icone }),
                creer("span", { classe: "nom", texte: fiche.nom }),
                creer("div", { classe: "compteur" }, [
                    moins,
                    creer("output", { texte: String(nombre) }),
                    plus,
                ]),
            ])
        );
    }

    section.append(liste);

    // Bilan : c'est lui qui dit au maître du jeu si la partie peut démarrer.
    const total = totalDe(composition);
    const joueurs = partie.joueurs.length;
    const bilan = creer("p", { classe: "bilan-composition" });

    if (joueurs < MINIMUM_JOUEURS) {
        bilan.classList.add("probleme");
        texte(bilan, `${joueurs} joueur${joueurs > 1 ? "s" : ""} présent${joueurs > 1 ? "s" : ""} — il en faut au moins ${MINIMUM_JOUEURS}.`);
    } else if (total !== joueurs) {
        bilan.classList.add("probleme");
        texte(bilan, `${total} rôle${total > 1 ? "s" : ""} pour ${joueurs} joueurs — il faut ajuster.`);
    } else {
        bilan.classList.add("pret");
        texte(bilan, `${total} rôles pour ${joueurs} joueurs : la partie peut commencer.`);
    }
    section.append(bilan);

    const auto = creer("button", {
        classe: "bouton bouton-discret",
        texte: "Répartition automatique",
        attributs: { type: "button" },
    });
    auto.addEventListener("click", async () => {
        const reponse = await commander("mj:composition-auto", { code: partie.code });
        if (reponse) {
            compositions.set(partie.code, {
                composition: reponse.composition,
                auto: true,
                pourJoueurs: partie.joueurs.length,
            });
            rendre();
        }
    });

    const lancer = creer("button", {
        classe: "bouton bouton-or",
        texte: "▶ Lancer la partie",
        attributs: { type: "button" },
    });
    lancer.disabled = joueurs < MINIMUM_JOUEURS || total !== joueurs;
    lancer.addEventListener("click", () =>
        commander("mj:lancer", { code: partie.code, composition }, "Partie lancée")
    );

    section.append(creer("div", { classe: "groupe-boutons" }, [lancer, auto]));
    return section;
}

// ─── Déroulement de la nuit ──────────────────────────────────────

function construireConduite(partie) {
    const section = creer("div", { classe: "section-mj" }, [
        creer("h3", { classe: "titre-section", texte: "Conduite de la partie" }),
    ]);

    if (partie.phase === "nuit" && partie.etapes.length > 0) {
        const etapes = creer("div", { classe: "etapes" });
        partie.etapes.forEach((etape, index) => {
            const etat = index < partie.indexEtape ? "faite" : index === partie.indexEtape ? "courante" : "";
            etapes.append(
                creer("span", { classe: `etape ${etat}`.trim() }, [
                    creer("span", { texte: ficheRole(etape.role)?.icone ?? "•" }),
                    creer("span", { texte: nomDe(etape.role) }),
                ])
            );
        });
        section.append(etapes);
    }

    if (partie.attente?.type === "chasseur") {
        const nom = partie.joueurs.find((j) => j.id === partie.attente.joueurId)?.pseudo ?? "Le chasseur";
        section.append(
            creer("p", {
                classe: "attente-mj",
                texte: `${nom} était le Chasseur : la partie attend qu'il désigne sa cible.`,
            })
        );
    }

    const boutons = creer("div", { classe: "groupe-boutons" });

    if (partie.phase !== "terminee") {
        const suivant = creer("button", {
            classe: "bouton bouton-or",
            texte: partie.phase === "jour" ? "▶ Dépouiller le vote" : "▶ Étape suivante",
            attributs: { type: "button" },
        });
        suivant.addEventListener("click", () => commander("mj:avancer", { code: partie.code }));
        boutons.append(suivant);

        if (partie.attente) {
            const passer = creer("button", {
                classe: "bouton bouton-discret",
                texte: "Passer sans attendre",
                attributs: { type: "button" },
            });
            passer.addEventListener("click", () =>
                commander("mj:avancer", { code: partie.code, forcer: true }, "Attente abandonnée")
            );
            boutons.append(passer);
        }

        for (const [phase, libelle, classe] of [
            ["nuit", "🌙 Forcer la nuit", "bouton-nuit"],
            ["jour", "☀️ Forcer le jour", "bouton-jour"],
        ]) {
            const bouton = creer("button", {
                classe: `bouton ${classe} bouton-petit`,
                texte: libelle,
                attributs: { type: "button" },
            });
            bouton.addEventListener("click", () => commander("mj:forcer-phase", { code: partie.code, phase }));
            boutons.append(bouton);
        }
    }

    section.append(boutons);
    return section;
}

// ─── Joueurs ─────────────────────────────────────────────────────

function construireJoueurs(partie) {
    const section = creer("div", { classe: "section-mj" }, [
        creer("h3", {
            classe: "titre-section",
            texte: `Joueurs (${partie.joueurs.filter((j) => j.vivant).length} en vie sur ${partie.joueurs.length})`,
        }),
    ]);

    if (partie.joueurs.length === 0) {
        section.append(creer("p", { classe: "carte-aide", texte: "Personne n'a encore rejoint." }));
        return section;
    }

    const liste = creer("div", { classe: "joueurs-mj" });

    for (const joueur of partie.joueurs) {
        const ligne = creer("div", { classe: `joueur-mj${joueur.vivant ? "" : " mort"}` });

        ligne.append(
            creer("span", { classe: `pastille-joueur ${joueur.vivant ? "vivant" : "mort"}` }),
            creer("span", { classe: "nom", texte: joueur.pseudo }),
            creer("span", {
                classe: `etiquette-role${joueur.role ? ` role-${joueur.role}` : " sans-role"}`,
                texte: joueur.role ? nomDe(joueur.role) : "sans rôle",
            })
        );

        if (!joueur.connecte) {
            ligne.append(creer("span", { classe: "carte-aide", texte: "hors ligne" }));
        }
        if (joueur.aVoteVillage || joueur.aVoteLoup) {
            ligne.append(creer("span", { classe: "marque-vote", texte: "a voté" }));
        }

        const actions = creer("div", { classe: "actions-joueur" });

        if (joueur.vivant) {
            const tuer = creer("button", {
                classe: "bouton bouton-sang bouton-petit",
                texte: "Éliminer",
                attributs: { type: "button" },
            });
            tuer.addEventListener("click", () => {
                if (window.confirm(`Éliminer ${joueur.pseudo} ?`)) {
                    commander("mj:tuer", { code: partie.code, joueurId: joueur.id });
                }
            });
            actions.append(tuer);
        } else {
            const ranimer = creer("button", {
                classe: "bouton bouton-vert bouton-petit",
                texte: "Ranimer",
                attributs: { type: "button" },
            });
            ranimer.addEventListener("click", () =>
                commander("mj:ressusciter", { code: partie.code, joueurId: joueur.id })
            );
            actions.append(ranimer);
        }

        const choixRole = creer("select", { attributs: { "aria-label": `Rôle de ${joueur.pseudo}` } });
        choixRole.append(creer("option", { texte: "Changer de rôle…", attributs: { value: "" } }));
        for (const fiche of ROLES) {
            const option = creer("option", { texte: fiche.nom, attributs: { value: fiche.id } });
            if (fiche.id === joueur.role) option.selected = true;
            choixRole.append(option);
        }
        choixRole.addEventListener("change", () => {
            if (!choixRole.value) return;
            commander(
                "mj:changer-role",
                { code: partie.code, joueurId: joueur.id, role: choixRole.value },
                `${joueur.pseudo} devient ${nomDe(choixRole.value)}`
            );
        });
        actions.append(choixRole);

        const ejecter = creer("button", {
            classe: "bouton bouton-discret bouton-petit",
            texte: "Éjecter",
            attributs: { type: "button" },
        });
        ejecter.addEventListener("click", () => {
            if (window.confirm(`Retirer ${joueur.pseudo} de la partie ?`)) {
                commander("mj:ejecter", { code: partie.code, joueurId: joueur.id }, `${joueur.pseudo} a été retiré`);
            }
        });
        actions.append(ejecter);

        ligne.append(actions);
        liste.append(ligne);
    }

    section.append(liste);
    return section;
}

// ─── Carte d'une partie ──────────────────────────────────────────

const LIBELLES_PHASE = {
    attente: "En attente",
    nuit: "🌙 Nuit",
    jour: "☀️ Jour",
    terminee: "Terminée",
};

function construireCartePartie(partie) {
    const carte = creer("article", { classe: `carte-partie ${partie.phase}` });

    const fermer = creer("button", {
        classe: "bouton bouton-discret bouton-petit",
        texte: "✕ Fermer",
        attributs: { type: "button" },
    });
    fermer.addEventListener("click", () => {
        if (window.confirm(`Fermer définitivement la partie ${partie.code} ?`)) {
            compositions.delete(partie.code);
            commander("mj:supprimer-partie", { code: partie.code }, `Partie ${partie.code} fermée`);
        }
    });

    const libelle = partie.phase === "nuit" || partie.phase === "jour"
        ? `${LIBELLES_PHASE[partie.phase]} ${partie.tour}`
        : LIBELLES_PHASE[partie.phase];

    // Raccourci vers l'ecran a projeter, deja pointe sur la bonne partie.
    const ecran = creer("a", {
        classe: "bouton bouton-discret bouton-petit",
        texte: "Écran",
        attributs: {
            href: `/ecran.html?code=${encodeURIComponent(partie.code)}`,
            target: "_blank",
            rel: "noopener",
            title: "Ouvrir l'écran de suivi pour cette partie",
        },
    });

    carte.append(
        creer("header", { classe: "entete-partie" }, [
            creer("span", { classe: "code-partie", texte: partie.code }),
            creer("span", { classe: `etiquette-phase ${partie.phase}`, texte: libelle }),
            ecran,
            fermer,
        ])
    );

    const corps = creer("div", { classe: "corps-partie" });

    if (partie.gagnant) {
        corps.append(
            creer("p", { classe: "bilan-composition pret", texte: `Vainqueur : ${partie.gagnant}.` })
        );
    }

    if (partie.phase === "attente") corps.append(construireComposeur(partie));
    else corps.append(construireConduite(partie));

    corps.append(construireJoueurs(partie));
    carte.append(corps);
    return carte;
}

// ─── Rendu global ────────────────────────────────────────────────

function rendre() {
    const grille = $("#grille-parties");
    vider(grille);

    texte(
        $("#compte-parties"),
        parties.length === 0
            ? "aucune partie"
            : `${parties.length} partie${parties.length > 1 ? "s" : ""} en cours`
    );

    if (parties.length === 0) {
        grille.append(
            creer("p", {
                classe: "aucune-partie",
                texte: "Aucune partie en cours. Créez-en une pour commencer.",
            })
        );
        return;
    }

    for (const partie of parties) grille.append(construireCartePartie(partie));
}

// ─── Historique ──────────────────────────────────────────────────

function dateLisible(horodatage) {
    return new Date(horodatage).toLocaleString("fr-FR", {
        dateStyle: "short",
        timeStyle: "short",
    });
}

async function ouvrirArchives() {
    const reponse = await commander("mj:archives", { limite: 50 });
    if (!reponse) return;

    const liste = $("#liste-archives");
    vider(liste);
    afficher($("#rejeu"), false);
    afficher($("#retour-liste"), false);
    afficher(liste, true);

    if (reponse.parties.length === 0) {
        liste.append(creer("p", { classe: "carte-aide", texte: "Aucune partie terminée pour l'instant." }));
    }

    for (const archive of reponse.parties) {
        const rejouer = creer("button", {
            classe: "bouton bouton-discret bouton-petit",
            texte: "Revoir",
            attributs: { type: "button" },
        });
        rejouer.addEventListener("click", () => afficherRejeu(archive.code));

        liste.append(
            creer("div", { classe: "ligne-archive" }, [
                creer("span", { classe: "code", texte: archive.code }),
                creer("span", {
                    classe: "quand",
                    texte: `${dateLisible(archive.termineeLe)} — ${archive.nombreJoueurs} joueurs, ${archive.tours} tour${archive.tours > 1 ? "s" : ""}`,
                }),
                creer("span", { classe: `gagnant ${archive.gagnant}`, texte: archive.gagnant ?? "—" }),
                rejouer,
            ])
        );
    }

    afficher($("#voile-archives"), true);
}

/** Traduit un événement archivé en une ligne lisible. */
function raconter(evenement, joueurs) {
    const nom = (id) => joueurs.find((joueur) => joueur.id === id)?.pseudo ?? "?";

    switch (evenement.type) {
        case "phase":
            return { texte: `— ${evenement.phase === "nuit" ? "Nuit" : "Jour"} ${evenement.tour} —`, classe: "tour" };
        case "etape":
            return { texte: `Appel : ${nomDe(evenement.role)}.` };
        case "role-attribue":
            return { texte: `${nom(evenement.joueurId)} reçoit le rôle de ${nomDe(evenement.role)}.` };
        case "meute":
            return { texte: `La meute : ${evenement.loups.map((loup) => loup.pseudo).join(", ")}.` };
        case "amoureux":
            return { texte: `Amoureux : ${evenement.pseudo}.` };
        case "voyante-resultat":
            return { texte: `La voyante sonde ${evenement.pseudo} : ${nomDe(evenement.role)}.` };
        case "sorciere-confirmee":
            return {
                texte: `La sorcière ${evenement.antidote ? "utilise son antidote" : ""}${evenement.antidote && evenement.ciblePoison ? " et " : ""}${evenement.ciblePoison ? `empoisonne ${nom(evenement.ciblePoison)}` : ""}${!evenement.antidote && !evenement.ciblePoison ? "passe son tour" : ""}.`,
            };
        case "votes-loups":
            return { texte: `Les loups votent (${evenement.votants.length}/${evenement.total}).` };
        case "votes-village":
            return { texte: `Le village vote (${evenement.votants.length}/${evenement.total}).` };
        case "mort":
            return { texte: `${evenement.pseudo} (${nomDe(evenement.role)}) meurt — ${evenement.cause}.` };
        case "aucune-mort":
            return { texte: "Aucune victime cette nuit." };
        case "attente":
            return { texte: `${evenement.pseudo}, chasseur, arme son fusil.` };
        case "tir-chasseur":
            return { texte: `${evenement.pseudo} abat ${evenement.ciblePseudo}.` };
        case "vote-resolu":
            if (evenement.motif === "elimine") return { texte: `Le village élimine ${evenement.pseudo}.` };
            return { texte: evenement.motif === "egalite" ? "Égalité au vote." : "Aucun vote." };
        case "resurrection":
            return { texte: `${evenement.pseudo} est ranimé par le maître du jeu.` };
        case "victoire":
            return { texte: evenement.message, classe: "tour" };
        default:
            return null;
    }
}

async function afficherRejeu(code) {
    const reponse = await commander("mj:archive", { code });
    if (!reponse) return;

    const zone = $("#rejeu");
    vider(zone);

    const { joueurs, evenements } = reponse.archive;
    for (const evenement of evenements) {
        const ligne = raconter(evenement, joueurs);
        if (!ligne) continue;
        const classes = [ligne.classe, evenement.visibilite === "privee" ? "privee" : ""].filter(Boolean);
        zone.append(creer("p", { classe: classes.join(" "), texte: ligne.texte }));
    }

    afficher($("#liste-archives"), false);
    afficher(zone, true);
    afficher($("#retour-liste"), true);
}

// ─── Événements du serveur ───────────────────────────────────────

socket.on("mj:parties", (liste) => {
    parties = liste;
    rendre();
});

socket.on("mj:partie", (partie) => {
    const index = parties.findIndex((candidate) => candidate.code === partie.code);
    if (index === -1) parties.push(partie);
    else parties[index] = partie;
    rendre();
});

socket.on("connect", () => {
    $("#pastille-service").classList.remove("hors-ligne");
    // Une coupure de reseau ne doit pas obliger a ressaisir le code :
    // le jeton de session rouvre l'acces tout seul.
    ouvrirSession();
});

socket.on("disconnect", () => {
    $("#pastille-service").classList.add("hors-ligne");
    messageEclair("Connexion perdue…", { erreur: true });
});

// ─── Commandes de la page ────────────────────────────────────────

$("#bouton-creer").addEventListener("click", async () => {
    const champ = $("#code-nouvelle-partie");
    const reponse = await commander(
        "mj:creer-partie",
        { code: champ.value.trim().toUpperCase() || null }
    );
    if (reponse) {
        champ.value = "";
        messageEclair(`Partie ${reponse.code} créée`);
    }
});

$("#code-nouvelle-partie").addEventListener("keydown", (evenement) => {
    if (evenement.key === "Enter") $("#bouton-creer").click();
});

$("#bouton-archives").addEventListener("click", ouvrirArchives);
$("#fermer-archives").addEventListener("click", () => afficher($("#voile-archives"), false));
$("#retour-liste").addEventListener("click", ouvrirArchives);

document.addEventListener("keydown", (evenement) => {
    if (evenement.key === "Escape") afficher($("#voile-archives"), false);
});

// Si la socket etait deja etablie, l'evenement « connect » ne repassera pas.
if (socket.connected) ouvrirSession();
