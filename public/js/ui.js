/**
 * Petites aides d'affichage, communes a toutes les pages.
 *
 * Regle unique et sans exception : on construit des noeuds et on passe le
 * texte par textContent. Jamais d'innerHTML avec du contenu venu du serveur.
 * L'ancien tableau de bord assemblait des chaines HTML contenant les pseudos ;
 * un joueur qui s'appelait « <img src=x onerror=…> » executait son code dans
 * le navigateur du maitre du jeu.
 */

export function $(selecteur, racine = document) {
    return racine.querySelector(selecteur);
}

export function $$(selecteur, racine = document) {
    return [...racine.querySelectorAll(selecteur)];
}

/**
 * Cree un element.
 * @param {string} balise
 * @param {{classe?: string, texte?: string, attributs?: object}} options
 * @param {Array<Node|string>} enfants
 */
export function creer(balise, options = {}, enfants = []) {
    const element = document.createElement(balise);

    if (options.classe) element.className = options.classe;
    if (options.texte !== undefined) element.textContent = options.texte;

    for (const [nom, valeur] of Object.entries(options.attributs ?? {})) {
        if (valeur === false || valeur === null || valeur === undefined) continue;
        element.setAttribute(nom, valeur === true ? "" : String(valeur));
    }

    for (const enfant of enfants) {
        element.append(typeof enfant === "string" ? document.createTextNode(enfant) : enfant);
    }

    return element;
}

export function vider(element) {
    if (element) element.replaceChildren();
}

/** Montre ou cache un element. Le CSS vit dans les feuilles, pas ici. */
export function afficher(element, visible) {
    if (element) element.hidden = !visible;
}

export function texte(element, contenu) {
    if (element) element.textContent = contenu;
}

/** Remplace la liste des classes d'etat d'un element sans toucher aux autres. */
export function poserEtat(element, prefixe, etat) {
    if (!element) return;
    for (const classe of [...element.classList]) {
        if (classe.startsWith(prefixe)) element.classList.remove(classe);
    }
    if (etat) element.classList.add(prefixe + etat);
}

/**
 * Remplit une liste deroulante. Conserve la selection en cours quand la
 * valeur existe toujours, pour ne pas la perdre a chaque rafraichissement.
 */
export function remplirSelect(select, options, { placeholder = null } = {}) {
    if (!select) return;

    const choisi = select.value;
    vider(select);

    if (placeholder) {
        select.append(creer("option", { texte: placeholder, attributs: { value: "" } }));
    }

    for (const { valeur, libelle } of options) {
        select.append(creer("option", { texte: libelle, attributs: { value: valeur } }));
    }

    if (options.some((option) => option.valeur === choisi)) select.value = choisi;
}

/** Message bref en bas d'ecran. */
let minuteurMessage = null;

export function messageEclair(contenu, { erreur = false, duree = 2600 } = {}) {
    const boite = $("#message-eclair");
    if (!boite) return;

    boite.textContent = contenu;
    boite.classList.toggle("erreur", erreur);
    boite.classList.add("visible");

    clearTimeout(minuteurMessage);
    minuteurMessage = setTimeout(() => boite.classList.remove("visible"), duree);
}

/** Lecture d'un parametre d'adresse, par exemple ?code=ABCD. */
export function parametre(nom) {
    return new URLSearchParams(window.location.search).get(nom);
}
