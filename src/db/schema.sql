-- Schema de la base de la partie. Cree au demarrage s'il n'existe pas.
--
-- Deux usages cohabitent :
--   * parties.etat garde un instantane complet, qui permet de reprendre une
--     partie interrompue par un redemarrage du serveur ;
--   * la table evenements garde le deroule detaille, qui permet de rejouer
--     une partie terminee (livrable « historique des actions »).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS parties (
    code         TEXT    PRIMARY KEY,
    creee_le     INTEGER NOT NULL,
    terminee_le  INTEGER,
    phase        TEXT    NOT NULL,
    tour         INTEGER NOT NULL DEFAULT 0,
    gagnant      TEXT,
    composition  TEXT,
    etat         TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS joueurs (
    id          TEXT    PRIMARY KEY,
    code_partie TEXT    NOT NULL REFERENCES parties(code) ON DELETE CASCADE,
    pseudo      TEXT    NOT NULL,
    jeton       TEXT    NOT NULL,
    role        TEXT,
    vivant      INTEGER NOT NULL DEFAULT 1,
    arrive_le   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS index_joueurs_partie ON joueurs(code_partie);

CREATE TABLE IF NOT EXISTS evenements (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code_partie TEXT    NOT NULL REFERENCES parties(code) ON DELETE CASCADE,
    tour        INTEGER NOT NULL,
    type        TEXT    NOT NULL,
    visibilite  TEXT    NOT NULL,
    donnees     TEXT    NOT NULL,
    horodatage  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS index_evenements_partie ON evenements(code_partie, id);
