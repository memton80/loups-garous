#!/usr/bin/env bash
#
# Installation du serveur Loup-Garou sur une machine Debian 12.
#
# A lancer en root depuis la racine du projet :
#
#     sudo ./scripts/deploiement.sh
#
# Le script installe Node.js, les dependances, cree un fichier .env avec un
# code de maitre du jeu tire au hasard, puis declare un service systemd qui
# redemarre le jeu automatiquement — y compris apres une coupure de courant,
# ce qui arrive vite avec un Raspberry Pi pose sur une table.
#
# Il est concu pour etre relance sans risque : rien n'est ecrase sans
# avertissement, et un .env existant est conserve.

set -euo pipefail

SERVICE="loups-garous"
DESTINATION="/opt/${SERVICE}"
UTILISATEUR="${SERVICE}"
VERSION_NODE="20"

PROJET="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

rouge()  { printf '\033[31m%s\033[0m\n' "$*"; }
vert()   { printf '\033[32m%s\033[0m\n' "$*"; }
titre()  { printf '\n\033[1;33m── %s\033[0m\n' "$*"; }

if [[ "${EUID}" -ne 0 ]]; then
    rouge "Ce script doit etre lance en root :  sudo $0"
    exit 1
fi

# ─── Node.js ────────────────────────────────────────────────────────
# Debian 12 fournit Node 18 par apt. Le projet demande Node 20 ou plus,
# on passe donc par le depot officiel NodeSource.

titre "Node.js"

installer_node() {
    apt-get update -qq
    apt-get install -y -qq ca-certificates curl gnupg
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key |
        gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${VERSION_NODE}.x nodistro main" \
        > /etc/apt/sources.list.d/nodesource.list
    apt-get update -qq
    apt-get install -y -qq nodejs
}

if command -v node > /dev/null 2>&1; then
    MAJEURE="$(node --version | sed 's/^v\([0-9]*\).*/\1/')"
    if [[ "${MAJEURE}" -ge 20 ]]; then
        vert "Node $(node --version) est deja installe."
    else
        echo "Node $(node --version) est trop ancien, installation de Node ${VERSION_NODE}…"
        installer_node
    fi
else
    echo "Installation de Node ${VERSION_NODE}…"
    installer_node
fi

# better-sqlite3 utilise un binaire precompile quand il en existe un pour la
# plateforme, et le compile sinon. Ces paquets couvrent le second cas.
titre "Outils de compilation"
apt-get install -y -qq build-essential python3 > /dev/null
vert "En place."

# ─── Utilisateur dedie ──────────────────────────────────────────────
# Le jeu n'a aucune raison de tourner en root.

titre "Utilisateur ${UTILISATEUR}"
if id "${UTILISATEUR}" > /dev/null 2>&1; then
    vert "Deja present."
else
    useradd --system --home "${DESTINATION}" --shell /usr/sbin/nologin "${UTILISATEUR}"
    vert "Cree."
fi

# ─── Copie des fichiers ─────────────────────────────────────────────

titre "Installation dans ${DESTINATION}"
mkdir -p "${DESTINATION}"

# On copie le projet sans ce qui ne doit pas voyager : la base de la machine
# de developpement, les dependances, l'historique git.
tar --create --file - \
    --exclude=node_modules \
    --exclude=.git \
    --exclude=data \
    --exclude=.env \
    -C "${PROJET}" . | tar --extract --file - -C "${DESTINATION}"

mkdir -p "${DESTINATION}/data"
vert "Fichiers copies."

titre "Dependances"
cd "${DESTINATION}"
if [[ -f package-lock.json ]]; then
    npm ci --omit=dev --silent
else
    npm install --omit=dev --silent
fi
vert "Installees."

# ─── Configuration ──────────────────────────────────────────────────

titre "Configuration"
if [[ -f "${DESTINATION}/.env" ]]; then
    vert "Un fichier .env existe deja, il est conserve."
else
    # Un code tire au hasard vaut mieux qu'un 1234 que tout le monde connait.
    CODE="$(shuf -i 1000-9999 -n 1)"
    cat > "${DESTINATION}/.env" <<EOF
# Configuration du serveur Loup-Garou.
# Genere le $(date '+%d/%m/%Y a %H:%M') par scripts/deploiement.sh

PORT=3000
ADMIN_PIN=${CODE}
DB_FILE=./data/loups-garous.db
EOF
    vert "Fichier .env cree."
    printf '\n    \033[1;33mCode du maitre du jeu : %s\033[0m\n' "${CODE}"
    printf '    Notez-le : il est modifiable dans %s/.env\n\n' "${DESTINATION}"
fi

chown -R "${UTILISATEUR}:${UTILISATEUR}" "${DESTINATION}"
chmod 640 "${DESTINATION}/.env"

# ─── Service systemd ────────────────────────────────────────────────

titre "Service systemd"
cat > "/etc/systemd/system/${SERVICE}.service" <<EOF
[Unit]
Description=Loup-Garou de Lannion — serveur de jeu
Documentation=file://${DESTINATION}/docs/installation.md
After=network.target

[Service]
Type=simple
User=${UTILISATEUR}
WorkingDirectory=${DESTINATION}
ExecStart=/usr/bin/node ${DESTINATION}/src/server.js
Restart=always
RestartSec=3

# Le service n'a besoin d'ecrire que dans son propre dossier de donnees.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${DESTINATION}/data

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "${SERVICE}" > /dev/null 2>&1
systemctl restart "${SERVICE}"
sleep 2

if systemctl is-active --quiet "${SERVICE}"; then
    vert "Service demarre."
else
    rouge "Le service n'a pas demarre. Voir :  journalctl -u ${SERVICE} -n 40"
    exit 1
fi

# ─── Adresses d'acces ───────────────────────────────────────────────

titre "Le jeu est en ligne"
PORT="$(grep -E '^PORT=' "${DESTINATION}/.env" | cut -d= -f2)"
for ADRESSE in $(hostname -I); do
    printf '    Joueurs      : http://%s:%s/\n' "${ADRESSE}" "${PORT}"
    printf '    Maitre du jeu: http://%s:%s/mj-connexion.html\n' "${ADRESSE}" "${PORT}"
    printf '    Ecran de suivi: http://%s:%s/ecran.html\n\n' "${ADRESSE}" "${PORT}"
done

cat <<EOF
Commandes utiles :

    systemctl status ${SERVICE}      etat du service
    journalctl -u ${SERVICE} -f      suivre les traces en direct
    systemctl restart ${SERVICE}     redemarrer apres un changement

EOF
