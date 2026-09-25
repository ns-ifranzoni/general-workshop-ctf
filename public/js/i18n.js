// UI translations for the participant portal and login screen.
// The admin panel is translated separately (admin-i18n.json).
const TRANSLATIONS = {
  en: {
    login_title: "Sign in",
    login_subtitle: "Enter your username and password to access the lab.",
    login_username: "Username",
    login_password: "Password",
    login_btn: "Login",
    login_no_account: "No account yet?",
    login_register_link: "Register here",
    admin_setup_title: "Set admin password",
    admin_setup_subtitle: "First sign-in for this admin account. Choose a password to secure it.",
    admin_setup_new_password: "New password",
    admin_setup_confirm_password: "Confirm password",
    admin_setup_btn: "Set password & sign in",
    adminSetupTooShort: "Password must be at least 8 characters.",
    adminSetupMismatch: "Passwords do not match.",
    register_title: "Create account",
    register_subtitle: "Register with your username, password and the workshop registration code.",
    register_code_label: "Registration Code",
    register_btn: "Create Account",
    register_have_account: "Already registered?",
    register_login_link: "Sign in",
    sidebarLabGuide: "Guidelines",
    sidebarLogout: "Sign out",
    participantSessionKicker: "Workshop session",
    panelLabTitle: "Guidelines",
    userRole: "Workshop participant",
    sidebarChallenges: "Challenges",
    sidebarLeaderboard: "Leaderboard",
    boardTitle: "Capture the Flag",
    boardSubtitle: "Investigate each scenario, find the answer and submit it as the flag.",
    labSteps: [
      { title: "🎯 Workshop objective", body: "Each challenge describes a scenario. Investigate it with the tools and environment provided by your instructor, find the answer and submit it as the flag." },
      { title: "🚩 Submitting answers", body: "Type the answer in the challenge card and press <strong>Check</strong>. Answers are not case-sensitive and extra spaces are ignored, but the value must be exact. Each wrong answer costs <strong>5 points</strong>." },
      { title: "💡 Hints", body: "Some challenges have a hint. Using it costs <strong>5 points</strong>, once per challenge. Try on your own first!" },
      { title: "📊 Leaderboard", body: "Your score updates in real time as you complete challenges. Open the <strong>Leaderboard</strong> panel to see your ranking among all workshop participants. The top 3 participants will be displayed on the podium. Keep going — every challenge counts!" },
      { title: "🆘 Support", body: "If you get stuck, ask your instructor. For technical issues (connection errors, score not updating), try refreshing the page — your session is saved automatically. If the problem persists, note the error message and notify the workshop team." },
    ],
  },
  es: {
    login_title: "Iniciar sesión",
    login_subtitle: "Introduce tu usuario y contraseña para acceder al laboratorio.",
    login_username: "Usuario",
    login_password: "Contraseña",
    login_btn: "Login",
    login_no_account: "¿No tienes cuenta?",
    login_register_link: "Regístrate aquí",
    admin_setup_title: "Configurar contraseña de admin",
    admin_setup_subtitle: "Primer acceso de esta cuenta de admin. Elige una contraseña para protegerla.",
    admin_setup_new_password: "Nueva contraseña",
    admin_setup_confirm_password: "Confirmar contraseña",
    admin_setup_btn: "Guardar contraseña y entrar",
    adminSetupTooShort: "La contraseña debe tener al menos 8 caracteres.",
    adminSetupMismatch: "Las contraseñas no coinciden.",
    register_title: "Crear cuenta",
    register_subtitle: "Regístrate con tu usuario, contraseña y el código de registro del workshop.",
    register_code_label: "Código de registro",
    register_btn: "Crear cuenta",
    register_have_account: "¿Ya estás registrado?",
    register_login_link: "Iniciar sesión",
    sidebarLabGuide: "Directrices",
    sidebarLogout: "Cerrar sesión",
    participantSessionKicker: "Sesión del workshop",
    panelLabTitle: "Directrices",
    userRole: "Participante del workshop",
    sidebarChallenges: "Retos",
    sidebarLeaderboard: "Leaderboard",
    boardTitle: "Capture the Flag",
    boardSubtitle: "Investiga cada escenario, encuentra la respuesta y envíala como flag.",
    labSteps: [
      { title: "🎯 Objetivo del workshop", body: "Cada reto describe un escenario. Investígalo con las herramientas y el entorno que te indique el instructor, encuentra la respuesta y envíala como flag." },
      { title: "🚩 Enviar respuestas", body: "Escribe la respuesta en la tarjeta del reto y pulsa <strong>Check</strong>. No se distinguen mayúsculas y se ignoran los espacios de más, pero el valor debe ser exacto. Cada respuesta incorrecta resta <strong>5 puntos</strong>." },
      { title: "💡 Pistas", body: "Algunos retos tienen una pista. Usarla cuesta <strong>5 puntos</strong>, una vez por reto. ¡Inténtalo primero por tu cuenta!" },
      { title: "📊 Leaderboard", body: "Tu puntuación se actualiza en tiempo real al completar desafíos. Abre el panel <strong>Leaderboard</strong> para ver tu posición entre todos los participantes. Los 3 mejores estudiantes aparecerán en el podio. ¡Cada desafío cuenta!" },
      { title: "🆘 Soporte", body: "Si te bloqueas, consulta al instructor. Para problemas técnicos (errores de conexión, puntuación sin actualizar), intenta refrescar la página — tu sesión se guarda automáticamente. Si el problema persiste, anota el error y notifica al equipo del workshop." },
    ],
  },
  pt: {
    login_title: "Entrar",
    login_subtitle: "Insira seu usuário e senha para acessar o laboratório.",
    login_username: "Usuário",
    login_password: "Senha",
    login_btn: "Login",
    login_no_account: "Ainda não tem conta?",
    login_register_link: "Registre-se aqui",
    admin_setup_title: "Definir senha de admin",
    admin_setup_subtitle: "Primeiro acesso desta conta de admin. Escolha uma senha para protegê-la.",
    admin_setup_new_password: "Nova senha",
    admin_setup_confirm_password: "Confirmar senha",
    admin_setup_btn: "Salvar senha e entrar",
    adminSetupTooShort: "A senha deve ter pelo menos 8 caracteres.",
    adminSetupMismatch: "As senhas não coincidem.",
    register_title: "Criar conta",
    register_subtitle: "Registre-se com seu usuário, senha e o código de registro do workshop.",
    register_code_label: "Código de registro",
    register_btn: "Criar conta",
    register_have_account: "Já está registrado?",
    register_login_link: "Entrar",
    sidebarLabGuide: "Diretrizes",
    sidebarLogout: "Sair",
    participantSessionKicker: "Sessão do workshop",
    panelLabTitle: "Diretrizes",
    userRole: "Participante do workshop",
    sidebarChallenges: "Desafios",
    sidebarLeaderboard: "Leaderboard",
    boardTitle: "Capture the Flag",
    boardSubtitle: "Investigue cada cenário, encontre a resposta e envie-a como flag.",
    labSteps: [
      { title: "🎯 Objetivo do workshop", body: "Cada desafio descreve um cenário. Investigue-o com as ferramentas e o ambiente indicados pelo instrutor, encontre a resposta e envie-a como flag." },
      { title: "🚩 Enviar respostas", body: "Digite a resposta no cartão do desafio e clique em <strong>Check</strong>. Maiúsculas e espaços extras são ignorados, mas o valor deve ser exato. Cada resposta errada custa <strong>5 pontos</strong>." },
      { title: "💡 Dicas", body: "Alguns desafios têm uma dica. Usá-la custa <strong>5 pontos</strong>, uma vez por desafio. Tente primeiro sozinho!" },
      { title: "📊 Leaderboard", body: "Sua pontuação é atualizada em tempo real conforme você completa os desafios. Abra o painel <strong>Leaderboard</strong> para ver sua classificação. Os 3 melhores estudantes aparecem no pódio. Continue — cada desafio conta!" },
      { title: "🆘 Suporte", body: "Se travar, consulte o instrutor. Para problemas técnicos (erros de conexão, pontuação não atualizada), tente atualizar a página — sua sessão é salva automaticamente. Se o problema persistir, anote a mensagem de erro e notifique a equipe do workshop." },
    ],
  },
  fr: {
    login_title: "Se connecter",
    login_subtitle: "Entrez votre nom d'utilisateur et votre mot de passe pour accéder au laboratoire.",
    login_username: "Nom d'utilisateur",
    login_password: "Mot de passe",
    login_btn: "Login",
    login_no_account: "Pas encore de compte ?",
    login_register_link: "S'inscrire ici",
    admin_setup_title: "Définir le mot de passe admin",
    admin_setup_subtitle: "Première connexion pour ce compte admin. Choisissez un mot de passe pour le sécuriser.",
    admin_setup_new_password: "Nouveau mot de passe",
    admin_setup_confirm_password: "Confirmer le mot de passe",
    admin_setup_btn: "Enregistrer et se connecter",
    adminSetupTooShort: "Le mot de passe doit comporter au moins 8 caractères.",
    adminSetupMismatch: "Les mots de passe ne correspondent pas.",
    register_title: "Créer un compte",
    register_subtitle: "Inscrivez-vous avec votre nom d'utilisateur, mot de passe et le code d'inscription du workshop.",
    register_code_label: "Code d'inscription",
    register_btn: "Créer le compte",
    register_have_account: "Déjà inscrit ?",
    register_login_link: "Se connecter",
    sidebarLabGuide: "Directives",
    sidebarLogout: "Se déconnecter",
    participantSessionKicker: "Session de workshop",
    panelLabTitle: "Directives",
    userRole: "Participant au workshop",
    sidebarChallenges: "Défis",
    sidebarLeaderboard: "Leaderboard",
    boardTitle: "Capture the Flag",
    boardSubtitle: "Analysez chaque scénario, trouvez la réponse et soumettez-la comme flag.",
    labSteps: [
      { title: "🎯 Objectif du workshop", body: "Chaque défi décrit un scénario. Analysez-le avec les outils et l'environnement fournis par l'instructeur, trouvez la réponse et soumettez-la comme flag." },
      { title: "🚩 Soumettre une réponse", body: "Saisissez la réponse dans la carte du défi et cliquez sur <strong>Check</strong>. La casse et les espaces superflus sont ignorés, mais la valeur doit être exacte. Chaque mauvaise réponse coûte <strong>5 points</strong>." },
      { title: "💡 Indices", body: "Certains défis proposent un indice. L'utiliser coûte <strong>5 points</strong>, une fois par défi. Essayez d'abord par vous-même !" },
      { title: "📊 Leaderboard", body: "Votre score se met à jour en temps réel à chaque défi complété. Ouvrez le panneau <strong>Leaderboard</strong> pour voir votre classement parmi tous les participants. Les 3 meilleurs étudiants apparaissent sur le podium. Continuez — chaque défi compte !" },
      { title: "🆘 Support", body: "Si vous êtes bloqué, demandez à l'instructeur. Pour les problèmes techniques (erreurs de connexion, score non mis à jour), essayez de rafraîchir la page — votre session est sauvegardée automatiquement. Si le problème persiste, notez le message d'erreur et signalez-le à l'équipe du workshop." },
    ],
  },
  de: {
    login_title: "Anmelden",
    login_subtitle: "Geben Sie Ihren Benutzernamen und Ihr Passwort ein, um auf das Labor zuzugreifen.",
    login_username: "Benutzername",
    login_password: "Passwort",
    login_btn: "Login",
    login_no_account: "Noch kein Konto?",
    login_register_link: "Hier registrieren",
    admin_setup_title: "Admin-Passwort festlegen",
    admin_setup_subtitle: "Erste Anmeldung für dieses Admin-Konto. Wählen Sie ein Passwort zur Absicherung.",
    admin_setup_new_password: "Neues Passwort",
    admin_setup_confirm_password: "Passwort bestätigen",
    admin_setup_btn: "Passwort speichern & anmelden",
    adminSetupTooShort: "Das Passwort muss mindestens 8 Zeichen lang sein.",
    adminSetupMismatch: "Die Passwörter stimmen nicht überein.",
    register_title: "Konto erstellen",
    register_subtitle: "Registrieren Sie sich mit Benutzername, Passwort und dem Workshop-Registrierungscode.",
    register_code_label: "Registrierungscode",
    register_btn: "Konto erstellen",
    register_have_account: "Bereits registriert?",
    register_login_link: "Anmelden",
    sidebarLabGuide: "Richtlinien",
    sidebarLogout: "Abmelden",
    participantSessionKicker: "Workshop-Sitzung",
    panelLabTitle: "Richtlinien",
    userRole: "Workshop-Teilnehmer",
    sidebarChallenges: "Aufgaben",
    sidebarLeaderboard: "Leaderboard",
    boardTitle: "Capture the Flag",
    boardSubtitle: "Untersuchen Sie jedes Szenario, finden Sie die Antwort und reichen Sie sie als Flag ein.",
    labSteps: [
      { title: "🎯 Ziel des Workshops", body: "Jede Aufgabe beschreibt ein Szenario. Untersuchen Sie es mit den Werkzeugen und der Umgebung Ihres Trainers, finden Sie die Antwort und reichen Sie sie als Flag ein." },
      { title: "🚩 Antworten einreichen", body: "Geben Sie die Antwort in der Aufgabenkarte ein und klicken Sie auf <strong>Check</strong>. Groß-/Kleinschreibung und zusätzliche Leerzeichen werden ignoriert, der Wert muss aber exakt sein. Jede falsche Antwort kostet <strong>5 Punkte</strong>." },
      { title: "💡 Hinweise", body: "Manche Aufgaben haben einen Hinweis. Er kostet <strong>5 Punkte</strong>, einmal pro Aufgabe. Versuchen Sie es zuerst selbst!" },
      { title: "📊 Leaderboard", body: "Ihr Punktestand aktualisiert sich in Echtzeit. Öffnen Sie das Panel <strong>Leaderboard</strong>, um Ihre Position unter allen Teilnehmern zu sehen. Die 3 besten Studierenden erscheinen auf dem Podium. Weitermachen — jede Aufgabe zählt!" },
      { title: "🆘 Support", body: "Bei Schwierigkeiten wenden Sie sich an den Trainer. Bei technischen Problemen (Verbindungsfehler, Punktestand wird nicht aktualisiert) laden Sie die Seite neu — Ihre Sitzung wird automatisch gespeichert. Sollte das Problem bestehen bleiben, notieren Sie die Fehlermeldung und informieren Sie das Workshop-Team." },
    ],
  },
};

let currentLang = localStorage.getItem('cd_lang') || 'en';
document.addEventListener('DOMContentLoaded', () => updateLangPicker(currentLang));

function t(key, ...args) {
  const tr = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
  const val = tr[key] || TRANSLATIONS.en[key] || key;
  return typeof val === 'function' ? val(...args) : val;
}

const LANG_FLAGS = { en: '🇬🇧', es: '🇪🇸', pt: '🇵🇹', fr: '🇫🇷', de: '🇩🇪' };

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem('cd_lang', lang);
  updateLangPicker(lang);
  applyTranslations();
  if (typeof applyAdminLang === 'function') applyAdminLang(lang);
}

function updateLangPicker(lang) {
  const flag = LANG_FLAGS[lang] || '🌐';
  const f = document.getElementById('login-lang-flag'); if (f) f.textContent = flag;
  const l = document.getElementById('login-lang-label'); if (l) l.textContent = lang.toUpperCase();
  document.querySelectorAll('.lang-picker-dropdown button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
  closeLangPicker();
}

function toggleLangPicker(e) {
  e.stopPropagation();
  document.getElementById('lang-picker-dropdown')?.classList.toggle('open');
}

function closeLangPicker() {
  document.getElementById('lang-picker-dropdown')?.classList.remove('open');
}

document.addEventListener('click', closeLangPicker);

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if (val && val !== key) el.textContent = val;
  });
  const set = (id, key) => { const el = document.getElementById(id); if (el) el.textContent = t(key); };
  set('sidebar-lab-guide', 'sidebarLabGuide');
  set('sidebar-challenges', 'sidebarChallenges');
  set('sidebar-leaderboard', 'sidebarLeaderboard');
  set('sidebar-logout', 'sidebarLogout');
  set('participant-session-kicker', 'participantSessionKicker');
  set('board-title', 'boardTitle');
  set('board-subtitle', 'boardSubtitle');
  set('panel-lab-title', 'panelLabTitle');
  set('user-role', 'userRole');

  renderLabInstructions();
}

function renderLabInstructions() {
  const container = document.getElementById('lab-instructions-content');
  if (!container) return;
  const steps = t('labSteps');
  container.innerHTML = steps.map((s) => {
    const icon = [...s.title][0];
    const label = s.title.slice(icon.length).trim();
    return `
    <div class="lab-step">
      <div class="step-number">${icon}</div>
      <div class="step-content">
        <h3>${label}</h3>
        <p>${s.body}</p>
      </div>
    </div>`;
  }).join('');
}
