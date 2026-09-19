/**
 * Catalogue des roles — SOURCE UNIQUE.
 *
 * Ce fichier est importe tel quel par les deux cotes :
 *   - le navigateur, via <script type="module">
 *   - le serveur, via import depuis src/game/
 *
 * Il ne doit donc contenir que du JavaScript standard, sans API propre a
 * Node ni au DOM. Toute information de jeu (ordre de la nuit, unicite,
 * seuils de distribution) vit ici et nulle part ailleurs.
 *
 * Aucune couleur n'est definie ici : la mise en forme se fait en CSS a partir
 * de la classe `role-<id>` appliquee sur la carte du joueur.
 */

/** Camps possibles. Le camp decide des conditions de victoire. */
export const CAMPS = {
    VILLAGE: "village",
    LOUPS: "loups",
};

/**
 * Etapes de la nuit. L'ordre numerique est celui dans lequel le maitre du jeu
 * appelle les roles, comme autour d'une vraie table.
 */
export const ETAPES_NUIT = {
    CUPIDON: "cupidon",
    VOYANTE: "voyante",
    LOUPS: "loups",
    SORCIERE: "sorciere",
};

export const ROLES = [
    {
        id: "villageois",
        nom: "Villageois",
        icone: "🧑‍🌾",
        camp: CAMPS.VILLAGE,
        accroche: "Force du nombre",
        description:
            "Le villageois est le coeur du village. Sans pouvoir particulier, sa force reside dans son instinct, sa capacite a observer et a convaincre ses voisins lors des deliberations.",
        pouvoirs: [
            { titre: "Vote", texte: "Participe aux votes d'elimination du jour. Sa voix compte autant que celle des autres." },
            { titre: "Observation", texte: "Peut tenter de reperer les comportements suspects des loups lors des echanges." },
        ],
        unique: false,
        ordreNuit: null,
        etapeNuit: null,
    },
    {
        id: "loup-garou",
        nom: "Loup-Garou",
        icone: "🐺",
        camp: CAMPS.LOUPS,
        accroche: "Predateur du village",
        description:
            "Le loup-garou se fond parmi les villageois le jour, jouant l'innocent. La nuit, il se reunit en meute avec ses congeneres pour designer une victime a devorer.",
        pouvoirs: [
            { titre: "Vote nocturne", texte: "Chaque nuit, vote avec les autres loups pour eliminer un villageois." },
            { titre: "Connaissance de la meute", texte: "Connait l'identite de tous ses allies loups des le debut de la partie." },
            { titre: "Dissimulation", texte: "Le jour, vote comme un villageois ordinaire pour detourner les soupcons." },
        ],
        unique: false,
        ordreNuit: 30,
        etapeNuit: ETAPES_NUIT.LOUPS,
    },
    {
        id: "voyante",
        nom: "Voyante",
        icone: "🔮",
        camp: CAMPS.VILLAGE,
        accroche: "Voit dans les ames",
        description:
            "Chaque nuit, la voyante peut lever le voile sur l'identite secrete d'un joueur. Elle seule sait qui est reellement loup — mais reveler son identite la mettrait en grand danger.",
        pouvoirs: [
            { titre: "Inspection nocturne", texte: "Une fois par nuit, choisit un joueur et decouvre son role exact." },
            { titre: "Guide discret", texte: "Peut orienter les votes du village sans reveler son identite." },
        ],
        unique: true,
        ordreNuit: 20,
        etapeNuit: ETAPES_NUIT.VOYANTE,
    },
    {
        id: "sorciere",
        nom: "Sorciere",
        icone: "🧪",
        camp: CAMPS.VILLAGE,
        accroche: "Antidote & poison",
        description:
            "La sorciere possede deux potions redoutables, chacune utilisable une seule fois dans toute la partie. Elle peut sauver une vie… ou en prendre une.",
        pouvoirs: [
            { titre: "Antidote", texte: "Sauve la victime designee par les loups cette nuit. Utilisable une seule fois dans la partie." },
            { titre: "Poison", texte: "Elimine n'importe quel joueur vivant cette meme nuit. Utilisable une seule fois dans la partie." },
        ],
        unique: true,
        ordreNuit: 40,
        etapeNuit: ETAPES_NUIT.SORCIERE,
    },
    {
        id: "cupidon",
        nom: "Cupidon",
        icone: "💘",
        camp: CAMPS.VILLAGE,
        accroche: "Lie deux destins",
        description:
            "La premiere nuit, Cupidon designe deux joueurs qui tomberont amoureux. Leur destin est desormais lie : si l'un meurt, l'autre le suit dans la mort par chagrin.",
        pouvoirs: [
            { titre: "Lien amoureux", texte: "La premiere nuit uniquement, choisit deux joueurs qui deviennent amoureux. Il peut se choisir lui-meme." },
            { titre: "Destin partage", texte: "Si l'un des amoureux meurt, l'autre meurt automatiquement de chagrin." },
        ],
        unique: true,
        ordreNuit: 10,
        etapeNuit: ETAPES_NUIT.CUPIDON,
        premiereNuitSeulement: true,
    },
    {
        id: "petite-fille",
        nom: "Petite-Fille",
        icone: "👁️",
        camp: CAMPS.VILLAGE,
        accroche: "Espionne de la nuit",
        description:
            "La petite-fille ose entrevoir la nuit des loups. Elle peut espionner discretement, mais si les loups la surprennent, ils peuvent choisir de l'eliminer en priorite.",
        pouvoirs: [
            { titre: "Espionnage", texte: "Peut observer discretement les loups durant leur phase nocturne." },
            { titre: "Risque", texte: "Si elle est reperee par les loups, elle devient une cible prioritaire." },
        ],
        unique: true,
        // Elle n'a pas d'etape a elle : elle epie pendant celle des loups.
        ordreNuit: null,
        etapeNuit: null,
        epieLesLoups: true,
    },
    {
        id: "chasseur",
        nom: "Chasseur",
        icone: "🏹",
        camp: CAMPS.VILLAGE,
        accroche: "Ne part jamais seul",
        description:
            "Le chasseur garde toujours une cartouche pour son dernier souffle. Quand il meurt — devore, empoisonne, lynche ou de chagrin — il abat immediatement le joueur de son choix.",
        pouvoirs: [
            { titre: "Coup de grace", texte: "A sa mort, quelle qu'en soit la cause, il designe un joueur vivant qui meurt sur le champ." },
            { titre: "Menace permanente", texte: "Le village hesite a le lyncher, et les loups a le devorer." },
        ],
        unique: true,
        ordreNuit: null,
        etapeNuit: null,
        tireEnMourant: true,
    },
];

/**
 * Les amoureux ne sont pas un role : c'est un etat pose par Cupidon.
 * On le decrit ici pour la fiche des regles affichee aux joueurs.
 */
export const ETATS = [
    {
        id: "amoureux",
        nom: "Les Amoureux",
        icone: "💞",
        camp: "solitaire",
        accroche: "Victoire a deux",
        description:
            "Designes par Cupidon, les amoureux ne vivent que l'un pour l'autre. Si l'un est un loup et l'autre un villageois, ils peuvent gagner ensemble en etant les deux derniers survivants.",
        pouvoirs: [
            { titre: "Condition de victoire unique", texte: "Si les deux amoureux sont les deux derniers survivants, ils gagnent ensemble — peu importe leur camp d'origine." },
            { titre: "Lien fatal", texte: "La mort de l'un entraine immediatement la mort de l'autre." },
        ],
    },
];

const PAR_ID = new Map(ROLES.map((role) => [role.id, role]));

/** Retourne la fiche d'un role, ou undefined si l'identifiant est inconnu. */
export function role(id) {
    return PAR_ID.get(id);
}

/** True si l'identifiant correspond a un role connu. */
export function roleExiste(id) {
    return PAR_ID.has(id);
}

/** Camp d'un role. Un identifiant inconnu est traite comme villageois. */
export function campDe(id) {
    return PAR_ID.get(id)?.camp ?? CAMPS.VILLAGE;
}

/** Nom lisible d'un role, pour les messages et le journal. */
export function nomDe(id) {
    return PAR_ID.get(id)?.nom ?? id;
}

/** Roles ayant une etape nocturne, dans l'ordre d'appel du maitre du jeu. */
export const ROLES_NOCTURNES = ROLES
    .filter((r) => r.ordreNuit !== null)
    .sort((a, b) => a.ordreNuit - b.ordreNuit);
