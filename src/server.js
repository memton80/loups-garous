import { createServer } from "node:http";
import { networkInterfaces } from "node:os";

import express from "express";
import { Server } from "socket.io";

import { config } from "./config.js";
import { brancherSockets } from "./sockets/index.js";

const app = express();
const serveurHttp = createServer(app);

// Le meme serveur sert le site ET le temps reel : le client se connecte a son
// origine, il n'y a donc aucune adresse IP a ecrire en dur nulle part.
const io = new Server(serveurHttp);

app.disable("x-powered-by");
app.use(express.static(config.dossierPublic, { extensions: ["html"] }));

app.get("/sante", (_requete, reponse) => {
    reponse.json({ etat: "ok", version: process.env.npm_package_version ?? null });
});

brancherSockets(io);

/** Adresses IPv4 non locales de la machine, pour afficher ou se connecter. */
function adressesLocales() {
    return Object.values(networkInterfaces())
        .flat()
        .filter((i) => i && i.family === "IPv4" && !i.internal)
        .map((i) => i.address);
}

serveurHttp.listen(config.port, () => {
    console.log("Loup-Garou de Lannion — serveur demarre");
    console.log(`  local   : http://localhost:${config.port}`);
    for (const adresse of adressesLocales()) {
        console.log(`  reseau  : http://${adresse}:${config.port}`);
    }
});

// Arret propre : sans ca, un Ctrl+C laisse les sockets ouverts quelques secondes.
for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
        console.log("\nArret du serveur…");
        io.close();
        serveurHttp.close(() => process.exit(0));
    });
}
