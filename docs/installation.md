# Guide d'installation

Ce guide remplace les anciens fichiers `instalation du serveur.md` et
`installation_nodejs_et_utilisation.md`, qui décrivaient une architecture à
deux serveurs (Apache pour le site, Node pour le temps réel) que le projet
n'utilise plus.

**Le jeu tient maintenant dans un seul serveur Node.** Il sert les pages, les
feuilles de style, les polices et le WebSocket sur le même port. Apache n'est
plus nécessaire, et — conséquence directe — il n'y a plus aucune adresse IP à
écrire dans les fichiers du site.

---

## 1. Installation automatique (recommandée)

Sur la machine qui hébergera le jeu, sous Debian 12 :

```bash
git clone https://github.com/memton80/loups-garous.git
cd loups-garous
sudo ./scripts/deploiement.sh
```

Le script s'occupe de tout :

| Étape | Ce qu'elle fait |
|---|---|
| Node.js | Installe Node 20 via le dépôt officiel NodeSource. Debian 12 ne fournit que Node 18 par `apt`, trop ancien pour le projet. |
| Dépendances | `npm ci --omit=dev` dans `/opt/loups-garous`. |
| Configuration | Crée un `.env` avec **un code de maître du jeu tiré au hasard**, affiché à la fin. Un `.env` déjà présent n'est pas écrasé. |
| Utilisateur | Crée un compte système `loups-garous` : le jeu ne tourne pas en root. |
| Service | Déclare un service systemd qui démarre au boot et redémarre tout seul en cas de plantage ou de coupure de courant. |

Le script affiche à la fin les adresses à donner aux joueurs. Il peut être
relancé sans risque après une mise à jour du code.

---

## 2. Installation manuelle

### Node.js 20

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
  | sudo tee /etc/apt/sources.list.d/nodesource.list
sudo apt update && sudo apt install -y nodejs
node --version   # doit afficher v20 ou plus
```

### Le projet

```bash
git clone https://github.com/memton80/loups-garous.git
cd loups-garous
npm install
cp .env.example .env
nano .env        # changez ADMIN_PIN !
npm start
```

Le serveur affiche au démarrage les adresses où il répond :

```
Loup-Garou de Lannion — serveur demarre
  local  : http://localhost:3000
  reseau : http://192.168.1.21:3000
```

---

## 3. Configuration

Tout tient dans le fichier `.env`, à la racine du projet.

| Variable | Rôle | Valeur par défaut |
|---|---|---|
| `PORT` | Port d'écoute du serveur. | `3000` |
| `ADMIN_PIN` | Code à quatre chiffres du maître du jeu. | `1234` |
| `DB_FILE` | Emplacement de la base SQLite. | `./data/loups-garous.db` |

> **Changez `ADMIN_PIN`.** Le serveur affiche un avertissement au démarrage
> tant qu'il vaut `1234`. Le code est limité à quelques essais par appareil,
> avec une attente qui grandit à chaque échec, mais un code connu de tous
> reste un code connu de tous.

Après toute modification du `.env` :

```bash
sudo systemctl restart loups-garous
```

---

## 4. Réseau

Le cahier des charges prévoit un point d'accès Wi-Fi dédié, isolé du réseau
principal. Deux conséquences importantes :

1. **Les joueurs n'ont pas Internet.** C'est pour cela que les polices de
   caractères sont servies par le serveur lui-même, depuis `public/fonts/`,
   et non par Google Fonts. Ne remplacez pas ces fichiers par des liens vers
   Internet : le soir de la partie, personne ne pourrait les charger.

2. **L'adresse du serveur peut changer.** Ce n'est plus un problème : le site
   et le WebSocket sont servis par le même serveur, et le navigateur se
   connecte à l'adresse par laquelle il est arrivé.

### Adresse fixe (conseillé)

Pour que l'adresse ne change pas d'une soirée à l'autre, réservez-la sur le
routeur, ou fixez-la sur le serveur :

```bash
sudo nano /etc/network/interfaces.d/jeu
```

```
auto eth0
iface eth0 inet static
    address 192.168.1.21
    netmask 255.255.255.0
    gateway 192.168.1.1
```

### Servir le jeu sur le port 80

Pour que les joueurs tapent `http://192.168.1.21` sans numéro de port :

```bash
sudo apt install -y iptables-persistent
sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 3000
sudo netfilter-persistent save
```

C'est préférable à faire écouter Node directement sur le port 80, qui
demanderait de lui donner des droits dont il n'a pas besoin.

---

## 5. Exploitation

```bash
systemctl status loups-garous      # le service tourne-t-il ?
journalctl -u loups-garous -f      # suivre les traces en direct
systemctl restart loups-garous     # redémarrer
systemctl stop loups-garous        # arrêter
```

### Mise à jour

```bash
cd ~/loups-garous
git pull
sudo ./scripts/deploiement.sh      # réinstalle et redémarre
```

Le `.env` et la base de données sont conservés.

### Sauvegarde

Tout l'historique des parties tient dans un seul fichier :

```bash
sudo cp /opt/loups-garous/data/loups-garous.db ~/sauvegarde-$(date +%F).db
```

### Une partie interrompue

Si le serveur redémarre en pleine partie, il recharge l'état depuis la base
et les joueurs retrouvent leur rôle en rouvrant la page — le navigateur garde
un jeton qui les identifie. Rien à faire de particulier.

---

## 6. En cas de problème

| Symptôme | Cause probable | Solution |
|---|---|---|
| `npm install` échoue sur `better-sqlite3` | Pas de binaire précompilé pour la plateforme, et pas de quoi le compiler. | `sudo apt install -y build-essential python3`, puis relancer. |
| Le service ne démarre pas | Port déjà pris, ou erreur de configuration. | `journalctl -u loups-garous -n 40` |
| Les joueurs ne joignent pas le serveur | Pare-feu, ou mauvais réseau Wi-Fi. | `sudo ufw allow 3000/tcp`, et vérifier que le téléphone est bien sur le point d'accès du jeu. |
| Les pages s'affichent sans la typographie du jeu | Les fichiers de `public/fonts/` manquent. | Vérifier que le dossier a bien été copié. |
| Le code du maître du jeu est refusé alors qu'il est bon | Trop d'essais ratés : une attente est imposée. | Patienter le temps indiqué à l'écran. |
| Code perdu | — | `sudo grep ADMIN_PIN /opt/loups-garous/.env` |
