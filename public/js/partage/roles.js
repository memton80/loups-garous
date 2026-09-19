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
            "Le villageois est le cœur du village. Sans pouvoir particulier, sa force réside dans son instinct, dans sa capacité à observer et à convaincre ses voisins lors des délibérations.",
        pouvoirs: [
            { titre: "Vote", texte: "Participe aux votes d'élimination du jour. Sa voix compte autant que celle des autres." },
            { titre: "Observation", texte: "Peut tenter de repérer les comportements suspects des loups lors des échanges." },
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
        accroche: "Prédateur du village",
        description:
            "Le loup-garou se fond parmi les villageois le jour, jouant l'innocent. La nuit, il se réunit en meute avec ses congénères pour désigner une victime à dévorer.",
        pouvoirs: [
            { titre: "Vote nocturne", texte: "Chaque nuit, vote avec les autres loups pour éliminer un villageois." },
            { titre: "Connaissance de la meute", texte: "Connaît l'identité de tous ses alliés loups dès le début de la partie." },
            { titre: "Dissimulation", texte: "Le jour, vote comme un villageois ordinaire pour détourner les soupçons." },
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
        accroche: "Voit dans les âmes",
        description:
            "Chaque nuit, la voyante peut lever le voile sur l'identité secrète d'un joueur. Elle seule sait qui est réellement loup — mais révéler son identité la mettrait en grand danger.",
        pouvoirs: [
            { titre: "Inspection nocturne", texte: "Une fois par nuit, choisit un joueur et découvre son rôle exact." },
            { titre: "Guide discret", texte: "Peut orienter les votes du village sans révéler son identité." },
        ],
        unique: true,
        ordreNuit: 20,
        etapeNuit: ETAPES_NUIT.VOYANTE,
    },
    {
        id: "sorciere",
        nom: "Sorcière",
        icone: "🧪",
        camp: CAMPS.VILLAGE,
        accroche: "Antidote et poison",
        description:
            "La sorcière possède deux potions redoutables, chacune utilisable une seule fois dans toute la partie. Elle peut sauver une vie… ou en prendre une.",
        pouvoirs: [
            { titre: "Antidote", texte: "Sauve la victime désignée par les loups cette nuit. Utilisable une seule fois dans la partie." },
            { titre: "Poison", texte: "Élimine n'importe quel joueur vivant cette même nuit. Utilisable une seule fois dans la partie." },
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
            "La première nuit, Cupidon désigne deux joueurs qui tomberont amoureux. Leur destin est désormais lié : si l'un meurt, l'autre le suit dans la mort par chagrin.",
        pouvoirs: [
            { titre: "Lien amoureux", texte: "La première nuit uniquement, choisit deux joueurs qui deviennent amoureux. Il peut se choisir lui-même." },
            { titre: "Destin partagé", texte: "Si l'un des amoureux meurt, l'autre meurt automatiquement de chagrin." },
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
            "La petite-fille ose entrevoir la nuit des loups. Elle peut espionner discrètement, mais si les loups la surprennent, ils peuvent choisir de l'éliminer en priorité.",
        pouvoirs: [
            { titre: "Espionnage", texte: "Peut observer discrètement les loups durant leur phase nocturne." },
            { titre: "Risque", texte: "Si elle est repérée par les loups, elle devient une cible prioritaire." },
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
            "Le chasseur garde toujours une cartouche pour son dernier souffle. Quand il meurt — dévoré, empoisonné, lynché ou de chagrin — il abat immédiatement le joueur de son choix.",
        pouvoirs: [
            { titre: "Coup de grâce", texte: "À sa mort, quelle qu'en soit la cause, il désigne un joueur vivant qui meurt sur-le-champ." },
            { titre: "Menace permanente", texte: "Le village hésite à le lyncher, et les loups à le dévorer." },
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
        accroche: "Victoire à deux",
        description:
            "Désignés par Cupidon, les amoureux ne vivent que l'un pour l'autre. Si l'un est un loup et l'autre un villageois, ils peuvent gagner ensemble en étant les deux derniers survivants.",
        pouvoirs: [
            { titre: "Condition de victoire unique", texte: "Si les deux amoureux sont les deux derniers survivants, ils gagnent ensemble — peu importe leur camp d'origine." },
            { titre: "Lien fatal", texte: "La mort de l'un entraîne immédiatement la mort de l'autre." },
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
