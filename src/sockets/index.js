/**
 * Point de branchement des gestionnaires socket.io.
 * Rempli au lot 2 (joueurs, maitre du jeu, spectateurs).
 */
export function brancherSockets(io) {
    io.on("connection", (socket) => {
        socket.on("disconnect", () => {});
    });
}
