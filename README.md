 GOAT Battle Royale
Un jeu de Battle Royale multijoueur en 3D avec des chèvres sur rollers !
 Fonctionnalités
Gameplay

3 armes : Pistol (9mm), AK-47, Sniper
Dégâts réalistes :

9mm : -20% HP
AK-47 : -15% HP (tir en rafale)
Sniper : -80% HP (headshot) / -30% HP (body)


Munitions infinies avec rechargement automatique
IA intelligentes qui bougent et attaquent
Collisions entre joueurs et environnement
Timer de 5 minutes avec statistiques finales
Power-ups d'armes à ramasser sur la carte

Contrôles
PC

Déplacement : ZQSD / WASD / Flèches
Sprint : Shift
Sauter : V
S'accroupir : Ctrl
Tirer : E ou Espace
Viser : Maintenir H ou C
Recharger : R (ou automatique)
Changer d'arme : 1 (Pistol), 2 (AK-47), 3 (Sniper)

Mobile

Joystick virtuel pour le déplacement
Boutons tactiles pour tirer, viser, sauter, recharger

Multijoueur

Salles publiques/privées
Système d'invitations entre joueurs
Chat en temps réel
Host contrôle le démarrage de la partie
Validation des pseudos (anti-NSFW/nazi/raciste)

Graphismes

Environnement 3D avec ferme, montagnes, bottes de foin
Enclos carré avec clôtures en bois
Effets visuels : explosions, douilles, particules
Scope sniper réaliste sans zone sombre
Armes visibles sur les joueurs

Audio

Sons d'armes réalistes
Effets sonores d'explosion, rechargement
Son moteur (désactivable)
Options audio dans les paramètres

 Installation
Prérequis

Node.js 18+ installé
npm ou yarn

Étapes

Créer la structure du projet :

bashmkdir goat-battle-royale
cd goat-battle-royale
mkdir public

Créer les fichiers :


Placer server.js à la racine
Placer index.html dans le dossier public/
Placer main.js dans le dossier public/
Placer package.json à la racine


Installer les dépendances :

bashnpm install

Lancer le serveur :

bashnpm start

Ouvrir le jeu :


Navigateur : http://localhost:3000
Mobile : http://[VOTRE_IP]:3000

 Structure du projet
goat-battle-royale/
├── server.js           # Serveur Node.js + Socket.io
├── package.json        # Dépendances npm
├── README.md          # Ce fichier
└── public/
    ├── index.html     # Interface HTML
    └── main.js        # Logique du jeu
 Comment jouer

Créer ou rejoindre une salle :

Entrez votre pseudo
Choisissez votre couleur
Sélectionnez vos contrôles (ZQSD, WASD, Flèches, Mobile)
Créez une salle ou rejoignez avec un code


Lobby :

Invitez des amis avec leur pseudo
Chattez avec les autres joueurs
L'hôte lance la partie quand tout le monde est prêt


Partie :

Survivez 5 minutes
Éliminez les IAs et autres joueurs
Ramassez les power-ups d'armes
Utilisez la tactique et les abris (bottes de foin)


Fin de partie :

Consultez les statistiques (kills/deaths)
Retournez au lobby ou au menu



 Paramètres
Cliquez sur le bouton SETTINGS en haut à droite du menu pour :

Activer/désactiver les effets sonores
Activer/désactiver le son du moteur
Consulter les contrôles

 Corrections apportées
Bugs corrigés
 Balles qui ne partaient pas → Corrigé : direction et vitesse fixées
Zone sombre dans le scope sniper → Corrigé : background transparent
 Rechargement manuel uniquement → Corrigé : rechargement automatique
 Munitions limitées → Corrigé : munitions infinies après rechargement
 IAs immobiles → Corrigé : IAs qui patrouillent et attaquent
Pas de collisions joueurs → Corrigé : collisions complètes
Invitations non reçues → Corrigé : système d'invitations fonctionnel
 Pas de fin de partie → Corrigé : timer 5min + écran de stats
 HP et vitesse buggés → Corrigé : affichage correct
Améliorations
 Mode tactile avec joystick virtuel
 Vrais sons d'armes (pistol, AK-47, sniper)
 Douilles visibles qui tombent
 Armes visibles sur les joueurs
 Validation pseudos (anti-NSFW/nazi/raciste)
 Dégâts corrects par arme
 Menu settings avec options audio
 Système de statistiques en fin de partie
 Configuration serveur
Pour déployer sur un serveur distant (Heroku, Railway, etc.) :

Modifier le port dans server.js si nécessaire
Configurer les variables d'environnement
S'assurer que les websockets sont autorisés

 Notes techniques

Three.js pour le rendu 3D
Socket.io pour le multijoueur en temps réel
Express pour servir les fichiers statiques
Howler.js pour l'audio (optionnel, fallback disponible)

 Contribution
Ce jeu est un projet de démonstration. N'hésitez pas à :

Améliorer les graphismes
Ajouter de nouvelles armes
Créer de nouvelles cartes
Optimiser les performances

 License
MIT License - Libre d'utilisation et de modification
 Roadmap

 Mode spectateur
 Plus de cartes
 Personnalisation des chèvres
 Classement global
 Replay des parties
 Mode équipes


Bon jeu ! 🐐🎮
