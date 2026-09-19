import { networkInterfaces } from "node:os";

import { creerServeur } from "./app.js";
import { config } from "./config.js";

const { serveurHttp, io } = creerServeur();

/** Adresses IPv4 non locales de la machine, pour afficher ou se connecter. */
function adressesLocales() {
    return Object.values(networkInterfaces())
        .flat()
        .filter((interfaceReseau) => interfaceReseau?.family === "IPv4" && !interfaceReseau.internal)
        .map((interfaceReseau) => interfaceReseau.address);
}

serveurHttp.listen(config.port, () => {
    console.log("Loup-Garou de Lannion — serveur demarre");
    console.log(`  local  : http://localhost:${config.port}`);
    for (const adresse of adressesLocales()) {
        console.log(`  reseau : http://${adresse}:${config.port}`);
    }
});

// Arret propre : sans cela, un Ctrl+C laisse les sockets ouverts un moment.
for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
        console.log("\nArret du serveur…");
        io.close();
        serveurHttp.close(() => process.exit(0));
    });
}
