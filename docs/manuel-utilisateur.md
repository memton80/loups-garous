# Manuel d'utilisation

Le site ne remplace pas la partie : il distribue les rôles et recueille les
actions secrètes. **Le débat, les accusations et le vote se font à voix haute,
autour de la table.** L'écran sert à ce qui doit rester caché, et à rien
d'autre.

---

## Pour le maître du jeu

### Avant de commencer

1. Ouvrez `http://<adresse-du-serveur>:3000/mj-connexion.html` et saisissez
   votre code à quatre chiffres.
2. Cliquez sur **Créer**. Laissez le champ vide pour obtenir un code tiré au
   hasard, ou imposez le vôtre (3 à 6 lettres ou chiffres).
3. Annoncez le code aux joueurs. S'il y a un vidéoprojecteur ou une
   télévision, ouvrez l'**Écran** depuis la carte de la partie : le code y
   est affiché en grand.

### Composer la partie

Quand tout le monde est entré, la carte de la partie affiche un composeur.
Ajustez le nombre de chaque rôle avec les boutons `+` et `−`.

- **Répartition automatique** propose un équilibre adapté au nombre de
  joueurs. C'est un bon point de départ.
- Le bilan sous la liste dit en clair si la partie peut commencer.
- Le bouton **Lancer** reste verrouillé tant que la composition ne compte pas
  exactement un rôle par joueur, avec au moins un loup.

Il faut au minimum quatre joueurs.

### Mener la partie

La nuit se déroule dans l'ordre où vous appelez les rôles à voix haute :

```
Cupidon (première nuit) → Voyante → Loups-Garous → Sorcière
```

Le tableau de bord affiche les étapes ; celle en cours est mise en évidence.
Annoncez le rôle, laissez le joueur agir sur son téléphone, puis cliquez sur
**Étape suivante**.

Quand la dernière étape est passée, la nuit se résout : les morts sont
annoncés à tout le monde, avec leur rôle, et le jour se lève.

Le jour, le village débat. Quand les voix sont faites, chacun enregistre son
vote sur son téléphone, puis vous cliquez sur **Dépouiller le vote**.

> En cas d'égalité, personne n'est éliminé. Idem si les loups ne se mettent
> pas d'accord : pensez à leur faire revoter avant de passer à l'étape
> suivante.

### Le chasseur

Quand le chasseur meurt — quelle qu'en soit la cause — la partie **s'arrête**
et attend qu'il désigne sa cible. Le tableau de bord le signale.

S'il n'a pas son téléphone sous la main, **Passer sans attendre** abandonne
son tir et la partie reprend.

### Rattraper une erreur

Chaque joueur porte trois commandes :

| Commande | Effet |
|---|---|
| **Éliminer** | Tue le joueur sur-le-champ. Les conséquences s'appliquent : le partenaire amoureux meurt aussi, le chasseur tire. |
| **Ranimer** | Ramène un joueur mort. Utile quand une élimination est partie trop vite. |
| **Changer de rôle** | Corrige un rôle mal attribué. Le joueur en est prévenu. |
| **Éjecter** | Retire complètement le joueur de la partie. |

**Forcer la nuit** et **Forcer le jour** sautent directement à la phase
voulue, si le déroulé s'est emmêlé.

### Après la partie

**Historique**, en haut de l'écran, liste les parties terminées. **Revoir**
rejoue le déroulé complet, confidences comprises : ce que la voyante a vu,
qui les loups ont désigné, ce que la sorcière a fait. Cet historique n'est
accessible qu'avec le code du maître du jeu.

Fermer une partie qui n'a jamais démarré ne laisse aucune trace. Fermer une
partie déjà jouée conserve son déroulé dans l'historique.

---

## Pour les joueurs

### Entrer dans la partie

1. Connectez-vous au Wi-Fi indiqué par le maître du jeu.
2. Ouvrez `http://<adresse-du-serveur>:3000` et touchez **Rejoindre une
   partie**.
3. Saisissez votre nom et le code de la partie.

Votre nom doit être unique dans la partie : si quelqu'un l'a déjà pris, il
faut en choisir un autre. C'est ce qui empêche quelqu'un d'entrer sous votre
nom pour récupérer votre rôle.

### Votre rôle

La carte en haut de l'écran affiche votre rôle et ce qu'il permet.
**Ne la montrez à personne.** Le bouton **Voir les rôles**, en bas à droite,
décrit tous les rôles du jeu : le consulter ne trahit pas le vôtre.

### La nuit

Vous ne voyez apparaître un panneau d'action que lorsque c'est **votre** tour.
Le reste du temps, gardez les yeux fermés — le journal vous dira au matin ce
qui s'est passé.

| Rôle | Ce que vous faites |
|---|---|
| **Loup-Garou** | Vous voyez vos congénères et désignez une victime. Mettez-vous d'accord : en cas d'égalité, personne n'est dévoré. |
| **Voyante** | Vous découvrez le rôle exact d'un joueur. Une seule fois par nuit. |
| **Sorcière** | On vous annonce la victime des loups. Vous pouvez la sauver, empoisonner quelqu'un d'autre, faire les deux, ou passer. Chaque potion ne sert qu'une fois dans toute la partie. |
| **Cupidon** | La première nuit seulement, vous liez deux joueurs — vous pouvez vous choisir. |
| **Petite-Fille** | Vous pouvez entrouvrir un œil pendant le tour des loups. L'application ne vous dit rien : c'est à la table qu'il faut regarder, discrètement. |
| **Chasseur** | Rien la nuit. Mais à votre mort, vous emportez quelqu'un avec vous. |
| **Villageois** | Rien la nuit. Le jour, votre voix compte autant que les autres. |

### Le jour

Le village débat **à voix haute**. Quand vous êtes décidés, choisissez un nom
dans la liste et enregistrez votre vote. On ne vote pas contre soi-même.

### Si vous mourez

Votre rôle est révélé à tout le monde. Vous gardez l'écran pour suivre la
partie, mais vous ne votez plus et n'agissez plus. **Et vous ne dites plus
rien** : c'est la règle du jeu, pas celle de l'application.

### Écran éteint, batterie vide, Wi-Fi perdu

Rouvrez simplement la page : votre navigateur garde de quoi vous reconnaître,
et vous retrouvez votre rôle, votre place dans la nuit et le journal de la
partie. Si le serveur lui-même redémarre, la partie reprend où elle en était.

---

## L'écran de suivi

À projeter ou à afficher sur une télévision :
`http://<adresse-du-serveur>:3000/ecran.html`

Il montre le code de la partie en grand, la phase en cours, les habitants du
village — vivants et morts — et la chronique des événements.

**Il ne révèle jamais le rôle d'un joueur vivant.** Ce n'est pas seulement
qu'il ne l'affiche pas : le serveur ne le lui envoie pas. On peut donc le
laisser allumé sans arrière-pensée, même si quelqu'un s'approche de l'écran.
