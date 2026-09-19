# Cahier des Charges – Loup-Garou Web en Local

**Projet :** Jeu Loup-Garou en ligne via site web multiplateforme, hébergé en interne  
**Porté par :** Ivan Pilorget  
**Date :** 13/03/2026

---

## Démarrage rapide

```bash
git clone https://github.com/memton80/loups-garous.git
cd loups-garous
sudo ./scripts/deploiement.sh     # installation complète sur Debian 12
```

Ou, pour essayer sur sa machine :

```bash
npm install
cp .env.example .env              # et changer ADMIN_PIN
npm start                         # http://localhost:3000
npm test                          # 91 tests
```

| Page | Adresse |
|---|---|
| Joueurs | `/` |
| Maître du jeu | `/mj-connexion.html` |
| Écran de suivi | `/ecran.html` |

Documentation : [installation](docs/installation.md) ·
[manuel d'utilisation](docs/manuel-utilisateur.md) ·
[architecture](docs/architecture.md)

---

## Table des matières

1. [Contexte & Objectifs](#1-contexte--objectifs)
2. [Périmètre Fonctionnel](#2-périmètre-fonctionnel)
3. [Périmètre Technique](#3-périmètre-technique)
4. [Livrables Attendus](#4-livrables-attendus)
5. [Schéma Réseau](#5-schéma-réseau)
6. [Planning Prévisionnel](#6-planning-prévisionnel)
7. [Risques & Contraintes](#7-risques--contraintes)
8. [Contributeurs](#8-Contributeurs)
9. [Écarts au cahier des charges](#9-écarts-au-cahier-des-charges)
10. [État de la réalisation](#10-état-de-la-réalisation)

---

## 1. Contexte & Objectifs

**Problématique :** Permettre aux joueurs de jouer au Loup-Garou en face-à-face, en utilisant un site web mobile-friendly pour la distribution des rôles et les actions nocturnes, sans rester scotchés à leur écran.

**Objectifs :**

- Site web responsive (PC, tablette, smartphone) pour gérer les parties.
- Hébergement interne : serveur local + point d'accès Wi-Fi.
- Interaction humaine : débat et votes à l'oral, seul le site gère les rôles (informations et actions) et les actions secrètes.

---

## 2. Périmètre Fonctionnel

### A. Site Web (multiplateforme)

| Fonctionnalité | Description |
|---|---|
| Création de parties | L'administrateur crée une partie, ajoute les joueurs, choisit les rôles. |
| Distribution des rôles | Attribution aléatoire et secrète des rôles aux joueurs connectés. |
| Affichage du rôle | Chaque joueur voit uniquement son rôle sur son appareil. |
| Actions nocturnes | Interface pour les rôles actifs (loup-garou, voyante, etc.) pendant la nuit. |
| Historique des actions | Suivi des victimes, votes, et événements de la partie. |
| Tableau de bord admin | Gestion des parties en cours, des joueurs, et des rôles. |
| Mode spectateur | Affichage public (vidéoprojecteur/TV) pour suivre la partie en direct. |

---

## 3. Périmètre Technique

### A. Technologies

| Composant | Technologie(s) proposée(s) | Retenu à la réalisation |
|---|---|---|
| Frontend | HTML5, CSS3, JavaScript (React ou Vue.js) — servi via Apache2 | HTML5, CSS3, JavaScript en modules ES — servi par le serveur Node ⁽¹⁾ |
| Backend | Node.js (Express) | Node.js 20 + Express |
| Base de données | MariaDB | SQLite ⁽²⁾ |
| Communication | WebSocket (Socket.io) pour le temps réel | Socket.io |
| Hébergement | PC avec une machine virtuelle Debian 12 | Debian 12, service systemd |
| Réseau | Point d'accès Wi-Fi dédié pour isoler le jeu du réseau principal | Inchangé ⁽³⁾ |

⁽¹⁾ ⁽²⁾ ⁽³⁾ Voir [Écarts au cahier des charges](#9-écarts-au-cahier-des-charges).

### B. Matériel

| Élément | Spécifications recommandées |
|---|---|
| Serveur | Raspberry Pi 4 (4 Go RAM) ou mini-PC sous Linux |
| Point d'accès Wi-Fi | Routeur dédié (ex : TP-Link, Netgear) ou mode point d'accès du serveur |
| Stockage | Carte SD (Raspberry) ou SSD (PC) |

### C. Architecture

- **Frontend :** Site web responsive, compatible tous navigateurs modernes, servi via Apache2.
- **Backend :** Node.js + Socket.io pour la communication temps réel.
- **Base de données :** MariaDB pour stocker les parties, joueurs et rôles.
- **Réseau :** Le serveur et le point d'accès Wi-Fi forment un réseau local dédié au jeu.

---

## 4. Livrables Attendus

- **Site web :** Accessible via navigateur sur le réseau local (adresse IP ou nom de domaine local).
- **Documentation :** Guide d'installation, manuel utilisateur, schémas réseau.
- **Code source :** Dépôt Git avec le code commenté.
- **Script de déploiement :** Pour installer facilement le site sur le serveur.

---

## 5. Schéma Réseau

[Voir le schéma réseau (Google Drive)](https://drive.google.com/file/d/1xF7j5Pa6w38LRumt-0bvtAgWB4EczpEt/view?usp=sharing)

---

## 6. Planning Prévisionnel

| Étape | Durée estimée | Livrable |
|---|---|---|
| Spécifications détaillées | 1 semaine | Cahier des charges finalisé |
| Setup serveur & réseau | 2 jours | Serveur + Wi-Fi opérationnels |
| Développement backend | 2 semaines | API Node.js + base de données |
| Développement frontend | 3 semaines | Site web responsive |
| Tests & corrections | 1 semaine | Version stable |

---

## 7. Risques & Contraintes

### Risques

- Latence réseau si trop de joueurs connectés simultanément.
- Gestion des reconnexions en cas de perte de signal Wi-Fi.

### Contraintes

- Nécessité d'un point d'accès Wi-Fi performant pour éviter les coupures.
- Compatibilité navigateurs : tester sur Chrome, Firefox, Safari.
---
## 8. Contributeurs
- Youwen Heitz
- Tom Edel
- Alexandre Pareige
---
## Lien ressource
- [Drive](https://drive.google.com/drive/folders/1dUYmftqv2jstfRzP8b6EHkhuLbTfFapB?usp=sharing)
- [Figma](https://www.figma.com/make/xsI5nLe9VTfXa6hX1jh68C/Loup-Garou-Game-Interface?t=Trlt7QsDzKpdXlxa-1)

---

## 9. Écarts au cahier des charges

Trois choix techniques s'écartent du cahier des charges initial. Ils sont
assumés et motivés.

**⁽¹⁾ Pas de React ni de Vue, et plus d'Apache.** Le site est servi par le
serveur Node lui-même, en JavaScript standard découpé en modules ES. Deux
raisons. D'abord, séparer Apache et Node obligeait à écrire l'adresse du
serveur dans les fichiers du site : elle y figurait en dur dans cinq
fichiers, et tout changement d'adresse cassait le jeu. Avec un serveur
unique, le navigateur se connecte à l'adresse par laquelle il est arrivé.
Ensuite, un cadre comme React imposerait une étape de compilation pour une
interface qui tient en cinq pages : le coût dépasse le bénéfice.

**⁽²⁾ SQLite plutôt que MariaDB.** Un seul fichier, aucun service à
administrer, aucun mot de passe à gérer, et une sauvegarde qui consiste à
copier ce fichier. MariaDB apporterait la concurrence d'accès et le réseau,
dont une partie de quinze joueurs sur un Raspberry Pi n'a aucun usage. Les
besoins du cahier des charges — historique des actions, suivi des parties —
sont couverts à l'identique.

**⁽³⁾ Conséquence du réseau isolé : les polices sont hébergées localement.**
Le point d'accès Wi-Fi dédié n'ayant pas d'accès à Internet, les téléphones
des joueurs ne peuvent pas joindre Google Fonts. Les fichiers de police sont
donc servis par le serveur, depuis `public/fonts/`.

---

## 10. État de la réalisation

### Fonctionnalités

| Fonctionnalité du cahier des charges | État |
|---|---|
| Création de parties | Fait — code tiré au hasard ou imposé |
| Choix des rôles par l'administrateur | Fait — composeur avec validation |
| Distribution aléatoire et secrète des rôles | Fait — tirage de Fisher-Yates |
| Affichage du rôle sur son seul appareil | Fait |
| Actions nocturnes | Fait — loups, voyante, sorcière, cupidon, petite-fille, chasseur |
| Historique des actions | Fait — rejeu complet d'une partie terminée |
| Tableau de bord administrateur | Fait |
| Mode spectateur (vidéoprojecteur) | Fait |
| Site responsive | Fait — conçu pour le téléphone d'abord |
| Script de déploiement | Fait — `scripts/deploiement.sh` |
| Documentation | Fait — `docs/` |

### Rôles disponibles

Villageois, Loup-Garou, Voyante, Sorcière, Cupidon, Petite-Fille, Chasseur.

### Au-delà du cahier des charges

- **Reprise après redémarrage** : une partie interrompue par une coupure
  repart où elle en était, et chaque joueur retrouve son rôle.
- **Reconnexion transparente** : perdre le Wi-Fi ou éteindre son écran ne
  fait pas perdre sa place.
- **91 tests automatiques** sur les règles du jeu, le réseau et l'archivage.

### Risques du cahier des charges, et ce qui a été fait

| Risque annoncé | Réponse apportée |
|---|---|
| Latence si trop de joueurs | État en mémoire, base écrite en arrière-plan. Une partie de quinze joueurs ne produit que quelques dizaines de messages par tour. |
| Reconnexions en cas de perte de signal | Jeton conservé par le navigateur : la reconnexion est automatique et restitue le rôle, la place dans la nuit et le journal. |
