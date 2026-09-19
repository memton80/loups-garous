# Architecture technique

## Vue d'ensemble

```
        Point d'accès Wi-Fi dédié (sans Internet)
                        │
      ┌─────────────────┼─────────────────┐
      │                 │                 │
 Téléphones        Téléphone du      Vidéoprojecteur
 des joueurs       maître du jeu       ou télévision
      │                 │                 │
      └─────────────────┼─────────────────┘
                        │  HTTP + WebSocket, port 3000
              ┌─────────▼──────────┐
              │   Serveur Node     │
              │  Express + socket  │
              │        .io         │
              └─────────┬──────────┘
                        │
                 ┌──────▼───────┐
                 │   SQLite     │
                 │ (un fichier) │
                 └──────────────┘
```

**Un seul serveur.** Express sert les pages, les feuilles de style, les
polices et le WebSocket sur le même port. Le client appelle `io()` sans
argument, ce qui le connecte à l'origine de la page : aucune adresse IP
n'apparaît dans le code du site, et changer l'adresse du serveur ne casse
rien.

> L'ancienne version séparait Apache (pour le site) et Node (pour le temps
> réel). L'adresse `192.168.1.21:3000` était alors écrite en dur dans cinq
> fichiers, et le moindre changement d'adresse rendait le jeu inutilisable.

---

## Organisation des fichiers

```
src/
├── server.js            point d'entrée : écoute et arrêt propre
├── app.js               construction de l'application (testable)
├── config.js            lecture du .env, valeurs par défaut
├── salons.js            registre des parties en mémoire
├── db/
│   ├── index.js         archivage SQLite
│   └── schema.sql       tables parties, joueurs, evenements
├── game/                ← le moteur, sans réseau ni base
│   ├── moteur.js        machine à états nuit/jour
│   ├── partie.js        état d'une partie et vues
│   ├── distribution.js  composition et tirage des rôles
│   └── victoire.js      conditions de victoire
└── sockets/
    ├── index.js         branchement
    ├── auth.js          code du maître du jeu, sessions, limitation
    ├── diffusion.js     aiguillage des événements
    ├── joueur.js        commandes des joueurs
    ├── mj.js            commandes du maître du jeu
    └── spectateur.js    écran de suivi (lecture seule)

public/
├── *.html               cinq pages
├── css/                 polices, base, composants, une feuille par page
├── fonts/               polices servies en local
└── js/
    ├── partage/roles.js ← catalogue des rôles, partagé avec le serveur
    ├── ui.js            fabrique de nœuds DOM, sans innerHTML
    ├── socket.js        connexion et mémoire locale
    └── jeu.js, mj.js, ecran.js, mj-connexion.js, panneau-roles.js
```

---

## Les trois idées qui structurent le code

### 1. Le moteur ne connaît pas le réseau

`src/game/` ne contient aucune référence à socket.io ni à SQLite. Chaque
fonction reçoit une action, modifie l'état de la partie et **retourne une
liste d'événements** :

```js
{ type: "mort", visibilite: "publique", joueurId, pseudo, role, cause }
{ type: "voyante-resultat", visibilite: "privee", destinataires: [id], … }
```

C'est ce qui permet de tester toutes les règles du jeu sans ouvrir un port :
la nuit complète, les cascades de morts, le tir du chasseur, les trois
conditions de victoire.

### 2. Un seul endroit décide qui voit quoi

`src/sockets/diffusion.js` lit la visibilité portée par chaque événement et
l'envoie à la bonne salle ou aux bonnes sockets. Il n'y a pas de décision de
confidentialité éparpillée dans les gestionnaires : en ajouter une nouvelle
consiste à marquer l'événement, pas à se souvenir de filtrer.

Trois vues coexistent, construites au même endroit (`src/game/partie.js`) :

| Vue | Pour qui | Contient |
|---|---|---|
| `vuePublique` | joueurs, écran de suivi | jamais le rôle d'un joueur **vivant** |
| `etatPersonnel` | un joueur | son rôle, sa meute, ses potions, son tour |
| `vueMaitreDuJeu` | maître du jeu | tout, c'est lui qui arbitre |

### 3. Le catalogue des rôles est partagé

`public/js/partage/roles.js` est importé **tel quel** par le navigateur
(`<script type="module">`) et par le serveur. Ordre d'appel de la nuit,
unicité des rôles, descriptions affichées : tout vient de là.

L'ancienne version dupliquait cette liste dans trois fichiers, qui avaient
déjà divergé. Le fichier partagé ne contient que du JavaScript standard, sans
API propre à Node ni au DOM, et ne demande aucune étape de compilation.

---

## Déroulement d'une partie

```
attente ──(mj:lancer)──► nuit ──étapes──► résolution ──► jour
                          ▲                                │
                          └────────(dépouillement)─────────┘
```

Les étapes de la nuit sont construites à son ouverture, à partir des rôles
**encore vivants**, triés par ordre d'appel :

```
Cupidon (1re nuit) → Voyante → Loups → Sorcière
```

Le maître du jeu avance d'une étape à l'autre. Il n'y a aucun minuteur : le
rythme est celui de sa voix, comme autour d'une vraie table.

### L'attente du chasseur

Quand le chasseur meurt, la résolution **se met en pause** sur un état
`enAttente`, le temps qu'il désigne sa cible, puis reprend là où elle s'était
arrêtée — y compris au milieu d'une cascade de morts. C'est un mécanisme
générique : ajouter un autre rôle qui réagit à sa mort ne demanderait pas de
toucher à la boucle de résolution.

---

## Sécurité

| Risque | Réponse |
|---|---|
| Prendre l'identité d'un autre joueur | À la première entrée, le serveur remet un jeton aléatoire, gardé par le navigateur. La reconnexion passe par lui et **jamais par le pseudo**. Un pseudo déjà pris est refusé. |
| Forcer le code du maître du jeu | Comparaison à temps constant, tentatives comptées par adresse, attente qui grandit (1 s, 5 s, 30 s, 5 min). |
| Vol de session du maître du jeu | Pas de secret partagé : un jeton aléatoire de 32 octets par session, gardé côté serveur, avec expiration. |
| Agir dans une partie où l'on n'est pas | Les gestionnaires lisent la partie sur `socket.data`, jamais dans le message reçu. |
| Injection par le pseudo | Affichage par nœuds DOM et `textContent`, jamais `innerHTML`. Validation du pseudo côté serveur (2 à 20 caractères, lettres, chiffres, espace, tiret, apostrophe). |
| Fuite de rôle | Un seul filtre, appliqué à la source ; l'écran de suivi ne reçoit que la vue publique. |

---

## Base de données

```sql
parties     (code, creee_le, terminee_le, phase, tour, gagnant, composition, etat)
joueurs     (id, code_partie, pseudo, jeton, role, vivant, arrive_le)
evenements  (id, code_partie, tour, type, visibilite, donnees, horodatage)
```

L'état vivant reste en mémoire — à l'échelle d'une soirée, tout est
instantané. La base est écrite au fil de l'eau, depuis les deux seules
fonctions par lesquelles passe tout changement d'état (`diffuser` et
`synchroniser`), et sert deux usages :

- `parties.etat` garde un instantané complet, relu au démarrage : une partie
  interrompue par un redémarrage repart où elle en était ;
- `evenements` garde le déroulé détaillé **avec sa visibilité**, ce qui
  permet de rejouer une partie terminée sans devoiler ce qui devait rester
  secret pendant qu'on la jouait.

SQLite a été préféré à MariaDB : un seul fichier, aucun service à
administrer, aucune configuration, et largement suffisant pour une quinzaine
de joueurs en réseau local. La sauvegarde consiste à copier un fichier.

---

## Protocole

Tous les messages du client attendent un accusé de réception
`{ ok, erreur? }`, plutôt qu'un événement d'erreur global.

**Le client vers le serveur**

| Message | Qui | Effet |
|---|---|---|
| `joueur:rejoindre` | joueur | Entre ou revient dans une partie. |
| `joueur:vote-loup`, `joueur:voyante`, `joueur:sorciere`, `joueur:cupidon`, `joueur:chasseur`, `joueur:vote` | joueur | Actions. Aucune ne porte le code de la partie. |
| `mj:pin`, `mj:session` | maître du jeu | Authentification. |
| `mj:creer-partie`, `mj:lancer`, `mj:avancer`, `mj:tuer`, `mj:ressusciter`, `mj:changer-role`, `mj:ejecter`, `mj:forcer-phase`, `mj:supprimer-partie` | maître du jeu | Conduite. |
| `mj:archives`, `mj:archive` | maître du jeu | Historique. |
| `spectateur:suivre` | écran | Suit une partie en lecture seule. |

**Le serveur vers le client**

| Message | Pour qui | Contenu |
|---|---|---|
| `partie:etat` | joueurs, écran | Vue publique, après chaque changement. |
| `joueur:etat` | un joueur | Sa vue personnelle. |
| `partie:evenement` | selon la visibilité | Un événement du moteur. |
| `mj:parties`, `mj:partie`, `mj:evenement` | maître du jeu | Vue complète. |
| `joueur:ejecte` | un joueur | Il a été retiré, ou la partie est fermée. |

L'état complet est renvoyé après chaque changement, en plus des événements :
un client qui a manqué un message se remet ainsi à jour tout seul.

---

## Tests

```bash
npm test
```

91 tests, répartis en quatre fichiers :

| Fichier | Ce qu'il couvre |
|---|---|
| `distribution.test.js` | Composition et tirage des rôles, y compris l'uniformité du mélange. |
| `moteur.test.js` | Toutes les règles : chaque pouvoir, les cascades de morts, le chasseur, les conditions de victoire, la confidentialité des événements. |
| `sockets.test.js` | Bout en bout, avec un vrai serveur : usurpation d'identité, portée des actions, authentification, fuites. |
| `persistance.test.js` | Archivage sur un vrai fichier SQLite, et reprise après redémarrage. |

Les tests du moteur ne touchent ni au réseau ni au disque. Ceux de la
persistance ont chacun leur propre fichier de base, pour qu'aucun n'hérite de
l'état du précédent.
