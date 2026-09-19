import { createServer } from "node:http";

import express from "express";
import { Server } from "socket.io";

import { config } from "./config.js";
import { ouvrirBase, partiesAReprendre } from "./db/index.js";
import { enregistrerSalon } from "./salons.js";
import { brancherSockets } from "./sockets/index.js";

/**
 * Construit l'application sans l'ecouter : le meme serveur sert les fichiers
 * du site ET le WebSocket, si bien que le client se connecte a son origine et
 * qu'aucune adresse IP n'a besoin d'etre ecrite dans le front.
 *
 * Separe de server.js pour que les tests puissent demarrer une instance sur un
 * port libre, puis la refermer.
 */
export function creerServeur({ fichierBase = config.fichierBase, reprendre = true } = {}) {
    ouvrirBase(fichierBase);

    let reprises = 0;
    if (reprendre) {
        for (const partie of partiesAReprendre()) {
            if (partie.joueurs.size === 0) continue;
            enregistrerSalon(partie);
            reprises += 1;
        }
    }

    const app = express();
    const serveurHttp = createServer(app);
    const io = new Server(serveurHttp);

    app.disable("x-powered-by");
    app.use(express.static(config.dossierPublic, { extensions: ["html"] }));

    app.get("/sante", (_requete, reponse) => {
        reponse.json({ etat: "ok" });
    });

    brancherSockets(io);

    return { app, serveurHttp, io, reprises };
}
