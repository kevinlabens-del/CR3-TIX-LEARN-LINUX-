import type { Check } from "../types";
import { createInitialState, executeCommandLine, type SimState } from "../sim-shell.ts";

export type LabDifficulty = "Découverte" | "Opérationnel" | "Avancé" | "Expert";

export interface LabScenario {
  id: string;
  title: string;
  role: string;
  track: "Fondamentaux" | "Administration" | "Réseau" | "DevOps" | "Sécurité";
  level: number;
  difficulty: LabDifficulty;
  duration: number;
  xp: number;
  briefing: string;
  objective: string;
  setupCommands: string[];
  checks: Check[];
  hints: [string, string, string];
  debrief: string;
  quickCommands: string[];
}

const lab = (scenario: LabScenario): LabScenario => scenario;

export const LABS: LabScenario[] = [
  lab({
    id: "find-lost-guide", title: "Le guide introuvable", role: "Support junior", track: "Fondamentaux", level: 1, difficulty: "Découverte", duration: 6, xp: 55,
    briefing: "Un collègue sait que le fichier guide.txt existe dans son espace, mais ignore dans quel dossier.",
    objective: "Retrouve le chemin exact de guide.txt à partir de ton dossier personnel.", setupCommands: [],
    checks: [{ type: "output", includes: "Documents/guide.txt", label: "Le chemin de guide.txt est affiché" }],
    hints: ["Une commande peut parcourir une arborescence.", "Utilise find depuis ton dossier personnel avec -name.", "Essaie : find ~ -name guide.txt"],
    debrief: "Tu as cherché par propriété plutôt que dossier par dossier : c'est le bon réflexe face à une arborescence inconnue.", quickCommands: ["pwd", "find ~ -name guide.txt"],
  }),
  lab({
    id: "clean-temp-file", title: "Nettoyage contrôlé", role: "Utilisateur Linux", track: "Fondamentaux", level: 2, difficulty: "Découverte", duration: 5, xp: 55,
    briefing: "Le fichier temp.txt n'est plus utile. Il faut le retirer sans toucher aux autres documents.",
    objective: "Supprime uniquement temp.txt puis vérifie le contenu du dossier.", setupCommands: [],
    checks: [{ type: "fileMissing", path: "~/temp.txt", label: "temp.txt a disparu" }],
    hints: ["Observe d'abord avec ls.", "La commande rm supprime un fichier.", "Essaie : rm temp.txt"],
    debrief: "Une suppression sûre commence toujours par l'identification exacte de la cible.", quickCommands: ["ls", "rm temp.txt"],
  }),
  lab({
    id: "project-archive", title: "Sauvegarde avant livraison", role: "Technicien poste de travail", track: "Fondamentaux", level: 2, difficulty: "Opérationnel", duration: 8, xp: 70,
    briefing: "Le dossier Projets doit être archivé avant une mise à jour importante.",
    objective: "Crée backup-projets.tar.gz dans ton dossier personnel à partir de Projets.", setupCommands: [],
    checks: [{ type: "fileExists", path: "~/backup-projets.tar.gz", label: "L'archive backup-projets.tar.gz existe" }],
    hints: ["tar permet de regrouper et compresser.", "Les options courantes sont -czf.", "Essaie : tar -czf backup-projets.tar.gz Projets"],
    debrief: "Tu as créé une sauvegarde reproductible avant une opération risquée.", quickCommands: ["ls Projets", "tar -czf backup-projets.tar.gz Projets"],
  }),
  lab({
    id: "ssh-key-permissions", title: "Clé SSH refusée", role: "Administrateur junior", track: "Sécurité", level: 3, difficulty: "Opérationnel", duration: 8, xp: 80,
    briefing: "SSH refuse une clé privée car ses permissions sont trop ouvertes.",
    objective: "Protège .ssh/id_ed25519 pour que seul son propriétaire puisse la lire et l'écrire.", setupCommands: ["chmod 644 .ssh/id_ed25519"],
    checks: [{ type: "permission", path: "~/.ssh/id_ed25519", mode: "600", label: "La clé privée possède le mode 600" }],
    hints: ["Inspecte la clé avec stat.", "Le propriétaire doit avoir lecture + écriture, les autres aucun droit.", "Essaie : chmod 600 .ssh/id_ed25519"],
    debrief: "Les clés privées trop permissives sont rejetées pour éviter qu'un autre utilisateur puisse les lire.", quickCommands: ["stat .ssh/id_ed25519", "chmod 600 .ssh/id_ed25519"],
  }),
  lab({
    id: "extract-errors", title: "Rapport d'incident", role: "Opérateur", track: "Administration", level: 3, difficulty: "Opérationnel", duration: 8, xp: 80,
    briefing: "Le responsable d'astreinte veut uniquement les erreurs du journal applicatif.",
    objective: "Extrais les lignes ERROR de logs/app.log dans incident.txt.", setupCommands: [],
    checks: [{ type: "fileContent", path: "~/incident.txt", includes: "ERROR", label: "incident.txt contient les erreurs" }],
    hints: ["grep filtre les lignes.", "Redirige ensuite le résultat vers un fichier.", "Essaie : grep ERROR logs/app.log > incident.txt"],
    debrief: "Tu as transformé un journal brut en preuve exploitable pour l'incident.", quickCommands: ["tail logs/app.log", "grep ERROR logs/app.log > incident.txt"],
  }),
  lab({
    id: "install-diagnostic-tool", title: "Outil de diagnostic manquant", role: "Technicien système", track: "Administration", level: 3, difficulty: "Opérationnel", duration: 7, xp: 75,
    briefing: "L'équipe a besoin de htop, absent de la machine de laboratoire.",
    objective: "Actualise l'index des paquets puis installe htop.", setupCommands: [],
    checks: [{ type: "package", name: "htop", label: "Le paquet htop est installé" }],
    hints: ["Commence par actualiser la liste des paquets.", "Enchaîne apt update puis apt install.", "Essaie : sudo apt update && sudo apt install htop"],
    debrief: "Tu as séparé l'actualisation du catalogue de l'installation du logiciel.", quickCommands: ["sudo apt update", "sudo apt install htop"],
  }),
  lab({
    id: "stop-runaway-process", title: "Processus incontrôlable", role: "Opérateur de production", track: "Administration", level: 3, difficulty: "Avancé", duration: 9, xp: 90,
    briefing: "Un worker monopolise presque tout le processeur et dégrade le service.",
    objective: "Identifie le PID du worker-bloque puis arrête-le.", setupCommands: [],
    checks: [{ type: "processKilled", pid: 4242, label: "Le processus 4242 est arrêté" }],
    hints: ["Observe les processus et leur %CPU.", "Repère worker-bloque dans ps aux.", "Après observation, utilise kill 4242."],
    debrief: "Tu as observé avant d'agir et ciblé le PID responsable plutôt qu'un processus au hasard.", quickCommands: ["ps aux", "kill 4242"],
  }),
  lab({
    id: "production-environment", title: "Variable de production", role: "Intégrateur", track: "DevOps", level: 4, difficulty: "Opérationnel", duration: 6, xp: 75,
    briefing: "Une application attend APP_ENV=production dans son environnement.",
    objective: "Définis et exporte APP_ENV avec la valeur production.", setupCommands: [],
    checks: [{ type: "env", name: "APP_ENV", value: "production", label: "APP_ENV vaut production" }],
    hints: ["Une variable est écrite NOM=valeur.", "export la rend disponible à l'environnement.", "Essaie : export APP_ENV=production"],
    debrief: "Tu as configuré le comportement d'une application sans modifier son code.", quickCommands: ["env", "export APP_ENV=production"],
  }),
  lab({
    id: "restore-web-service", title: "Service web arrêté", role: "Administrateur système", track: "Administration", level: 4, difficulty: "Avancé", duration: 10, xp: 105,
    briefing: "Le service webapp ne répond plus. Son unité systemd est inactive.",
    objective: "Diagnostique puis remets webapp en état actif.", setupCommands: ["sudo systemctl stop webapp"],
    checks: [{ type: "service", name: "webapp", status: "active", label: "webapp est actif" }],
    hints: ["Consulte d'abord le statut du service.", "journalctl -u webapp montre son journal.", "Redémarre avec sudo systemctl restart webapp."],
    debrief: "Tu as appliqué la boucle professionnelle : statut, journal, action, vérification.", quickCommands: ["systemctl status webapp", "journalctl -u webapp", "sudo systemctl restart webapp"],
  }),
  lab({
    id: "remote-support", title: "Intervention distante", role: "Administrateur système", track: "Réseau", level: 4, difficulty: "Opérationnel", duration: 7, xp: 80,
    briefing: "Tu dois ouvrir une session d'assistance sur server.lab avec l'utilisateur admin.",
    objective: "Établis une connexion SSH simulée vers admin@server.lab.", setupCommands: ["chmod 600 .ssh/id_ed25519"],
    checks: [{ type: "ssh", host: "server.lab", label: "La session vers server.lab est établie" }],
    hints: ["La forme générale est ssh utilisateur@hôte.", "L'utilisateur demandé est admin.", "Essaie : ssh admin@server.lab"],
    debrief: "La session est simulée et isolée, mais la syntaxe et le raisonnement sont ceux d'une vraie intervention.", quickCommands: ["ssh admin@server.lab"],
  }),
  lab({
    id: "dns-diagnosis", title: "Nom de domaine à vérifier", role: "Technicien réseau", track: "Réseau", level: 4, difficulty: "Avancé", duration: 8, xp: 90,
    briefing: "L'équipe soupçonne un problème DNS sur api.creatix.test.",
    objective: "Interroge le DNS et affiche l'adresse associée à api.creatix.test.", setupCommands: [],
    checks: [{ type: "output", includes: "api.creatix.test", label: "La réponse DNS de api.creatix.test est affichée" }],
    hints: ["Il faut interroger le résolveur DNS.", "La commande dédiée est dig.", "Essaie : dig api.creatix.test"],
    debrief: "Tu as isolé la couche DNS avant d'accuser l'application ou le réseau IP.", quickCommands: ["ip route", "dig api.creatix.test"],
  }),
  lab({
    id: "git-config-audit", title: "Configuration modifiée", role: "Développeur Linux", track: "DevOps", level: 5, difficulty: "Avancé", duration: 8, xp: 90,
    briefing: "Une modification locale de config.yml doit être comprise avant validation.",
    objective: "Affiche précisément les différences non validées du dépôt.", setupCommands: [],
    checks: [{ type: "output", includes: "debug: false", label: "La modification de config.yml est visible" }],
    hints: ["git status indique qu'un fichier a changé.", "Cherche la commande qui affiche les lignes modifiées.", "Essaie : git diff"],
    debrief: "Tu as inspecté le contenu du changement, pas seulement l'état du dépôt.", quickCommands: ["git status", "git diff"],
  }),
  lab({
    id: "container-recovery", title: "API en mauvaise santé", role: "Ingénieur DevOps", track: "DevOps", level: 5, difficulty: "Avancé", duration: 11, xp: 115,
    briefing: "Le conteneur api est unhealthy tandis que la base de données fonctionne.",
    objective: "Inspecte les conteneurs et remets api en état running.", setupCommands: [],
    checks: [{ type: "docker", container: "api", status: "running", label: "Le conteneur api est running" }],
    hints: ["Commence par docker ps.", "docker logs api donne le contexte.", "Dans ce scénario, redémarre avec docker restart api."],
    debrief: "Tu as limité l'action au composant défaillant au lieu de redémarrer toute la plateforme.", quickCommands: ["docker ps", "docker logs api", "docker restart api"],
  }),
  lab({
    id: "cron-audit", title: "Sauvegarde planifiée", role: "Auditeur système", track: "Administration", level: 5, difficulty: "Avancé", duration: 7, xp: 85,
    briefing: "Une sauvegarde est annoncée chaque nuit à 02:30. Tu dois confirmer sa planification.",
    objective: "Affiche la crontab et retrouve la tâche de sauvegarde.", setupCommands: [],
    checks: [{ type: "output", includes: "30 2 * * *", label: "La planification de 02:30 est affichée" }],
    hints: ["La planification utilisateur se trouve dans la crontab.", "L'option -l liste les tâches.", "Essaie : crontab -l"],
    debrief: "Tu as vérifié l'automatisation à sa source plutôt que de supposer qu'elle existe.", quickCommands: ["crontab -l"],
  }),
  lab({
    id: "production-capstone", title: "Incident de production", role: "Responsable d'astreinte", track: "DevOps", level: 5, difficulty: "Expert", duration: 20, xp: 220,
    briefing: "Le site renvoie 503. La clé SSH est exposée, webapp est arrêté et le conteneur api est unhealthy.",
    objective: "Sécurise la clé, restaure les deux composants puis confirme une réponse HTTP 200.", setupCommands: ["chmod 644 .ssh/id_ed25519", "sudo systemctl stop webapp"],
    checks: [
      { type: "permission", path: "~/.ssh/id_ed25519", mode: "600", label: "La clé SSH est sécurisée" },
      { type: "service", name: "webapp", status: "active", label: "webapp est actif" },
      { type: "docker", container: "api", status: "running", label: "api est running" },
      { type: "output", includes: "200 OK", label: "Le contrôle HTTP retourne 200 OK" },
    ],
    hints: ["Traite séparément sécurité, service et conteneur.", "Utilise chmod 600, systemctl restart et docker restart.", "Termine par curl http://web.lab pour valider de bout en bout."],
    debrief: "Tu as sécurisé, diagnostiqué, restauré puis vérifié le service de bout en bout : c'est une vraie démarche d'astreinte.", quickCommands: ["stat .ssh/id_ed25519", "systemctl status webapp", "docker ps", "curl http://web.lab"],
  }),
];

export interface PracticalExam {
  level: number;
  title: string;
  prompt: string;
  setupCommands: string[];
  checks: Check[];
  quickCommands: string[];
}

export const PRACTICAL_EXAMS: PracticalExam[] = [
  { level: 1, title: "Se repérer", prompt: "Affiche le chemin exact du dossier dans lequel tu te trouves.", setupCommands: [], checks: [{ type: "output", includes: "/home/learner", label: "Le chemin courant est affiché" }], quickCommands: [] },
  { level: 2, title: "Préparer un espace", prompt: "Crée un dossier examen puis un fichier preuve.txt à l'intérieur.", setupCommands: [], checks: [{ type: "fileExists", path: "~/examen/preuve.txt", label: "examen/preuve.txt existe" }], quickCommands: [] },
  { level: 3, title: "Protéger une clé", prompt: "Corrige les permissions de .ssh/id_ed25519 avec le mode recommandé pour une clé privée.", setupCommands: ["chmod 644 .ssh/id_ed25519"], checks: [{ type: "permission", path: "~/.ssh/id_ed25519", mode: "600", label: "La clé possède le mode 600" }], quickCommands: ["stat .ssh/id_ed25519"] },
  { level: 4, title: "Restaurer un service", prompt: "Remets le service webapp en état actif.", setupCommands: ["sudo systemctl stop webapp"], checks: [{ type: "service", name: "webapp", status: "active", label: "webapp est actif" }], quickCommands: ["systemctl status webapp"] },
  { level: 5, title: "Résoudre un incident", prompt: "Restaure webapp et api, puis obtiens une réponse HTTP 200 de http://web.lab.", setupCommands: ["sudo systemctl stop webapp"], checks: [{ type: "service", name: "webapp", status: "active", label: "webapp est actif" }, { type: "docker", container: "api", status: "running", label: "api est running" }, { type: "output", includes: "200 OK", label: "La réponse HTTP est saine" }], quickCommands: ["systemctl status webapp", "docker ps", "curl http://web.lab"] },
];

export function createScenarioState(setupCommands: string[]): SimState {
  let state = createInitialState();
  for (const command of setupCommands) state = executeCommandLine(state, command).state;
  state.history = [];
  state.lastCommand = "";
  state.lastOutput = "";
  state.lastExitCode = 0;
  return state;
}

export const totalLabXp = LABS.reduce((sum, scenario) => sum + scenario.xp, 0);
