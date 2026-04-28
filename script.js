const revealItems = document.querySelectorAll(".reveal");

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  {
    threshold: 0.16,
    rootMargin: "0px 0px -48px 0px",
  }
);

revealItems.forEach((item, index) => {
  item.style.transitionDelay = `${Math.min(index * 45, 220)}ms`;
  revealObserver.observe(item);
});

const header = document.querySelector(".site-header");

window.addEventListener(
  "scroll",
  () => {
    header.classList.toggle("is-scrolled", window.scrollY > 16);
  },
  { passive: true }
);

const STORAGE_KEY = "hobbytrack.mvp.v1";
const MAX_HOBBIES = 50;
const MAX_SESSIONS_PER_HOBBY = 500;
const VALID_VIEWS = new Set([
  "auth",
  "onboarding",
  "dashboard",
  "add-hobby",
  "log-session",
  "hobby-detail",
]);
const HOBBY_TEMPLATES = {
  Guitar: "Warmups and one song section",
  Watercolor: "Finish a small color study",
  Spanish: "Twenty minutes of listening practice",
  Running: "Complete one comfortable run",
  Ceramics: "Plan the next studio session",
  Journaling: "Write one short reflection",
};

const toISODate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseLocalDate = (value) => {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(year, month - 1, day);
};

const daysAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toISODate(date);
};

const createDefaultState = () => ({
  authMode: "signup",
  signedIn: false,
  onboarded: false,
  currentView: "auth",
  selectedPlan: "free",
  storageAvailable: true,
  storageNotice: "",
  user: {
    name: "",
    email: "",
  },
  weeklyGoal: 300,
  firstHobby: "Guitar",
  selectedDetailHobby: "Guitar",
  hobbies: [],
});

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const clampNumber = (value, min, max, fallback) => {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(Math.max(number, min), max);
};

const cleanText = (value, maxLength, fallback = "") => {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (text || fallback).slice(0, maxLength);
};

const hasReadableCharacters = (value) => /[^\s._,'"!?@#$%^&*()+=[\]{}|\\/:;-]/.test(value);

const containsMarkupCharacters = (value) => /[<>]/.test(value);

const isValidISODate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return false;
  }
  const date = parseLocalDate(value);
  return !Number.isNaN(date.getTime()) && toISODate(date) === value;
};

const normalizeDate = (value) => (isValidISODate(value) ? value : daysAgo(0));

const normalizeState = (savedState) => {
  const fallback = createDefaultState();
  if (!isPlainObject(savedState)) {
    return fallback;
  }

  const merged = {
    ...fallback,
    ...savedState,
    user: {
      ...fallback.user,
      ...(isPlainObject(savedState?.user) ? savedState.user : {}),
    },
  };

  merged.hobbies = Array.isArray(savedState?.hobbies)
    ? savedState.hobbies.slice(0, MAX_HOBBIES).map((hobby) => {
        const name = cleanText(hobby?.name, 40, "Untitled hobby");
        return {
          id: cleanText(hobby?.id, 60, name.toLowerCase().replace(/\s+/g, "-")),
          name,
          category: cleanText(hobby?.category, 40),
          goal: clampNumber(hobby?.goal, 30, 1200, 60),
          plan: cleanText(hobby?.plan, 120, "Plan one small session"),
          streak: clampNumber(hobby?.streak, 0, 3650, 0),
          sessions: Array.isArray(hobby?.sessions)
            ? hobby.sessions.slice(0, MAX_SESSIONS_PER_HOBBY).map((session) => ({
              createdAt: normalizeDate(session?.createdAt),
              minutes: clampNumber(session?.minutes, 5, 360, 5),
              focus: cleanText(session?.focus, 120),
              note: cleanText(session?.note, 500),
              nextStep: cleanText(session?.nextStep, 120),
              milestone: cleanText(session?.milestone, 120),
            }))
            : [],
        };
      })
    : [];

  merged.user.name = cleanText(merged.user.name, 40);
  merged.user.email = "";
  merged.weeklyGoal = clampNumber(merged.weeklyGoal, 60, 1200, fallback.weeklyGoal);
  merged.selectedPlan = "free";
  merged.authMode = merged.authMode === "login" ? "login" : "signup";
  merged.currentView = cleanText(merged.currentView, 30, "auth");

  if (!VALID_VIEWS.has(merged.currentView)) {
    merged.currentView = merged.signedIn ? "dashboard" : "auth";
  }

  if (merged.hobbies.length && !merged.hobbies.some((hobby) => hobby.name === merged.firstHobby)) {
    merged.firstHobby = merged.hobbies[0].name;
  }

  if (merged.hobbies.length && !merged.hobbies.some((hobby) => hobby.name === merged.selectedDetailHobby)) {
    merged.selectedDetailHobby = merged.firstHobby;
  }

  return merged;
};

const loadState = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? normalizeState(JSON.parse(saved)) : createDefaultState();
  } catch {
    const fallback = createDefaultState();
    fallback.storageNotice = "Saved data was unreadable, so HobbyTrack started fresh.";
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      fallback.storageAvailable = false;
    }
    return fallback;
  }
};

let state = loadState();

const views = document.querySelectorAll(".product-view");
const navButtons = document.querySelectorAll("[data-view-target]");
const appStatus = document.querySelector("#appStatus");
const authMessage = document.querySelector("#authMessage");
const onboardingMessage = document.querySelector("#onboardingMessage");
const addHobbyMessage = document.querySelector("#addHobbyMessage");
const logSessionMessage = document.querySelector("#logSessionMessage");
const authForm = document.querySelector("#authForm");
const authName = document.querySelector("#authName");
const authEmail = document.querySelector("#authEmail");
const authPassword = document.querySelector("#authPassword");
const authModeButtons = document.querySelectorAll("[data-auth-mode]");
const onboardingForm = document.querySelector("#onboardingForm");
const hobbyType = document.querySelector("#hobbyType");
const weeklyGoal = document.querySelector("#weeklyGoal");
const firstHobby = document.querySelector("#firstHobby");
const firstNextStep = document.querySelector("#firstNextStep");
const addHobbyForm = document.querySelector("#addHobbyForm");
const logSessionForm = document.querySelector("#logSessionForm");
const sessionHobby = document.querySelector("#sessionHobby");
const sessionDate = document.querySelector("#sessionDate");
const detailHobbySelect = document.querySelector("#detailHobbySelect");

const saveState = () => {
  try {
    const persistedState = {
      ...state,
      storageNotice: "",
      user: {
        name: state.user.name,
        email: "",
      },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedState));
    state.storageAvailable = true;
  } catch {
    state.storageAvailable = false;
    if (appStatus) {
      appStatus.textContent = "Storage unavailable";
    }
  }
};

const setMessage = (element, message, type = "error") => {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.dataset.type = type;
  element.hidden = !message;
};

const clearMessages = () => {
  [authMessage, onboardingMessage, addHobbyMessage, logSessionMessage].forEach((element) =>
    setMessage(element, "")
  );
};

const createElement = (tag, options = {}) => {
  const element = document.createElement(tag);

  if (options.className) {
    element.className = options.className;
  }

  if (options.text !== undefined) {
    element.textContent = options.text;
  }

  if (options.type) {
    element.type = options.type;
  }

  return element;
};

const createEmptyState = (title, copy) => {
  const wrapper = createElement("div", { className: "empty-state" });
  wrapper.append(
    createElement("strong", { text: title }),
    createElement("p", { text: copy })
  );
  return wrapper;
};

const formatMinutes = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (!hours) {
    return `${mins}m`;
  }

  if (!mins) {
    return `${hours}h`;
  }

  return `${hours}h ${mins}m`;
};

const getPlanLimit = () => 3;

const getPlanLabel = () => "Free";

const getStartOfWeek = () => {
  const date = new Date();
  const day = date.getDay() || 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - day + 1);
  return date;
};

const isThisWeek = (createdAt) => parseLocalDate(createdAt) >= getStartOfWeek();

const isFutureDate = (createdAt) =>
  parseLocalDate(createdAt) > parseLocalDate(toISODate(new Date()));

const formatSessionDate = (createdAt) => {
  const today = toISODate(new Date());
  const yesterday = daysAgo(1);

  if (createdAt === today) {
    return "Today";
  }

  if (createdAt === yesterday) {
    return "Yesterday";
  }

  return parseLocalDate(createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

const formatExactDate = (createdAt) =>
  parseLocalDate(createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

const getRelativeDateLabel = (createdAt) => {
  const today = toISODate(new Date());
  const yesterday = daysAgo(1);

  if (createdAt === today) {
    return "Today";
  }

  if (createdAt === yesterday) {
    return "Yesterday";
  }

  return "";
};

const pluralize = (count, singular, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

const getTotalMinutes = (hobby) =>
  hobby.sessions.reduce((total, session) => total + session.minutes, 0);

const getWeeklyMinutes = (hobby) =>
  hobby.sessions
    .filter((session) => isThisWeek(session.createdAt))
    .reduce((total, session) => total + session.minutes, 0);

const getWeeklySessions = () =>
  state.hobbies.flatMap((hobby) =>
    hobby.sessions
      .filter((session) => isThisWeek(session.createdAt))
      .map((session) => ({ ...session, hobbyName: hobby.name }))
  );

const getAllSessions = () =>
  state.hobbies
    .flatMap((hobby) => hobby.sessions.map((session) => ({ ...session, hobbyName: hobby.name })))
    .sort((a, b) => parseLocalDate(b.createdAt) - parseLocalDate(a.createdAt));

const getBestActiveHobby = () => {
  const ranked = state.hobbies
    .map((hobby) => ({ hobby, minutes: getWeeklyMinutes(hobby) }))
    .sort((a, b) => b.minutes - a.minutes);
  return ranked[0]?.minutes ? ranked[0] : null;
};

const getMilestones = () => {
  const totalSessions = state.hobbies.reduce((sum, hobby) => sum + hobby.sessions.length, 0);
  const totalMinutes = state.hobbies.reduce((sum, hobby) => sum + getTotalMinutes(hobby), 0);
  const weeklySessionCount = getWeeklySessions().length;

  return [
    { label: "First session", earned: totalSessions >= 1 },
    { label: "3 sessions this week", earned: weeklySessionCount >= 3 },
    { label: "10 total sessions", earned: totalSessions >= 10 },
    { label: "5 hours tracked", earned: totalMinutes >= 300 },
  ];
};

const calculateStreak = (hobby) => {
  const sessionDates = new Set(
    hobby.sessions
      .map((session) => session.createdAt)
      .filter((createdAt) => !isFutureDate(createdAt))
  );
  let streak = 0;
  const cursor = new Date();

  while (sessionDates.has(toISODate(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
};

const getHobbyByName = (name) =>
  state.hobbies.find((hobby) => hobby.name === name) || state.hobbies[0] || null;

const findHobbyByName = (name) =>
  state.hobbies.find((hobby) => hobby.name === name);

const setView = (viewName) => {
  const requestedView = VALID_VIEWS.has(viewName) ? viewName : "dashboard";
  const nextView = state.signedIn || requestedView === "auth" ? requestedView : "auth";
  state.currentView = nextView;
  clearMessages();

  views.forEach((view) => {
    const isActive = view.dataset.view === nextView;
    view.classList.toggle("active", isActive);
    view.hidden = !isActive;
  });

  navButtons.forEach((button) => {
    const isActive = button.dataset.viewTarget === nextView;
    button.classList.toggle("active", isActive);
    if (isActive) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });

  renderApp();
  saveState();
};

const renderSelects = () => {
  if (!state.hobbies.length) {
    sessionHobby.replaceChildren(new Option("Add a hobby first", ""));
    detailHobbySelect.replaceChildren(new Option("No hobbies yet", ""));
    return;
  }

  const options = state.hobbies.map((hobby) => new Option(hobby.name, hobby.name));
  sessionHobby.replaceChildren(...options.map((option) => option.cloneNode(true)));
  detailHobbySelect.replaceChildren(...options);
  detailHobbySelect.value = state.selectedDetailHobby;
};

const renderDashboard = () => {
  const focus = getHobbyByName(state.firstHobby);
  const hasHobbies = state.hobbies.length > 0;
  const weeklySessions = getWeeklySessions();
  const weeklyTotal = state.hobbies.reduce(
    (total, hobby) => total + getWeeklyMinutes(hobby),
    0
  );
  const totalGoal = state.hobbies.length
    ? state.hobbies.reduce((total, hobby) => total + hobby.goal, 0)
    : state.weeklyGoal;
  const progress = Math.min((weeklyTotal / totalGoal) * 100, 100);
  const totalTracked = state.hobbies.reduce(
    (total, hobby) => total + getTotalMinutes(hobby),
    0
  );
  const bestStreak = Math.max(0, ...state.hobbies.map(calculateStreak));

  const totalSessionCount = state.hobbies.reduce((sum, hobby) => sum + hobby.sessions.length, 0);
  document.querySelector("#dashboardSubcopy").textContent = !hasHobbies
    ? "Start by adding one hobby. HobbyTrack will turn it into a simple weekly practice plan."
    : totalSessionCount
      ? state.user.name
        ? `Welcome back, ${state.user.name}. Check your next step, then log the next practice session.`
        : "Check your next step, then log the next practice session when you begin."
      : `You are set up. Next action: do one small ${focus?.name || "practice"} session and log it here.`;
  document.querySelector("#todayFocus").textContent = focus?.name || "Add your first hobby";
  document.querySelector("#todayPlanText").textContent =
    focus?.plan
      ? totalSessionCount
        ? `Next step: ${focus.plan}`
        : `Start here: ${focus.plan}. Afterward, log what you practiced.`
      : "Start by adding one hobby and one realistic next step.";
  const firstAction = document.querySelector(".first-action");
  firstAction.textContent = !hasHobbies
    ? "Add first hobby"
    : totalSessionCount
      ? "Log next session"
      : "Log first session";
  firstAction.dataset.viewTarget = hasHobbies ? "log-session" : "add-hobby";
  document.querySelector("#todayProgress").style.width = `${progress}%`;
  document.querySelector("#weeklyProgress").textContent = formatMinutes(weeklyTotal);
  document.querySelector("#weeklyGoalLabel").textContent = `of ${formatMinutes(totalGoal)} goal`;
  document.querySelector("#streakCount").textContent = `${bestStreak} days`;
  document.querySelector("#totalTime").textContent = formatMinutes(totalTracked);

  const activeHobbies = document.querySelector("#activeHobbies");
  activeHobbies.replaceChildren();

  if (hasHobbies) {
    const hobbyRows = state.hobbies.map((hobby) => {
      const total = getWeeklyMinutes(hobby);
      const hobbyProgress = Math.min(Math.round((total / hobby.goal) * 100), 100);
      const row = createElement("button", { className: "hobby-row", type: "button" });
      const label = createElement("span");
      label.append(
        createElement("strong", { text: hobby.name }),
        document.createTextNode(hobby.plan)
      );
      row.dataset.detailHobby = hobby.name;
      row.append(label, createElement("em", { text: `${hobbyProgress}%` }));
      return row;
    });

    activeHobbies.append(...hobbyRows);
  } else {
    activeHobbies.append(
      createEmptyState(
        "No hobbies yet",
        "Add one hobby with a weekly target and the next small action you can take."
      )
    );
  }

  const bestActive = getBestActiveHobby();
  document.querySelector("#reviewSessions").textContent = weeklySessions.length;
  document.querySelector("#reviewTime").textContent = formatMinutes(weeklyTotal);
  document.querySelector("#reviewBestHobby").textContent = bestActive?.hobby.name || "None yet";
  document.querySelector("#weeklyReviewProgress").textContent = `${Math.round(progress)}%`;
  document.querySelector("#reviewProgressBar").style.width = `${progress}%`;
  document.querySelector("#weeklyReviewSummary").textContent = weeklySessions.length
    ? `${pluralize(weeklySessions.length, "session")} logged this week, with ${formatMinutes(
        weeklyTotal
      )} of focused practice.`
    : focus
      ? `Next action: do one ${focus.name} session and log it. Your weekly review will start from that first entry.`
      : "Add one hobby, then log a focused session to begin your weekly review.";

  const milestoneList = document.querySelector("#milestoneList");
  const earnedMilestones = getMilestones().filter((milestone) => milestone.earned).length;
  document.querySelector("#milestoneStatus").textContent = earnedMilestones
    ? `${earnedMilestones} earned`
    : "Upcoming";
  milestoneList.replaceChildren(
    ...getMilestones().map((milestone) => {
      const badge = createElement("span", {
        className: `milestone-badge${milestone.earned ? " earned" : ""}`,
        text: milestone.label,
      });
      return badge;
    })
  );

  const timeline = document.querySelector("#progressTimeline");
  const recentSessions = getAllSessions().slice(0, 5);
  timeline.replaceChildren();

  if (recentSessions.length) {
    timeline.append(...recentSessions.map(createTimelineItem));
  } else {
    timeline.append(
      createEmptyState(
        "No timeline yet",
        "Your first logged session will appear here with the date, focus, note, and next step."
      )
    );
  }
};

const createTimelineItem = (session) => {
  const article = createElement("article");
  const header = createElement("div", { className: "session-item-header" });
  const meta = createElement("div", { className: "session-item-meta" });
  const relativeLabel = getRelativeDateLabel(session.createdAt);

  meta.append(
    createElement("strong", { text: `${session.hobbyName ? `${session.hobbyName} - ` : ""}${formatMinutes(session.minutes)}` }),
    createElement("span", { text: formatExactDate(session.createdAt) })
  );

  header.append(meta);

  if (relativeLabel) {
    header.append(createElement("em", { className: "session-badge", text: relativeLabel }));
  }

  article.append(header);

  if (session.focus) {
    article.append(createElement("span", { text: `Focus: ${session.focus}` }));
  }

  if (session.milestone) {
    article.append(createElement("span", { text: `Milestone: ${session.milestone}` }));
  }

  if (session.note) {
    article.append(createElement("p", { text: session.note }));
  }

  if (session.nextStep) {
    article.append(createElement("small", { text: `Next step: ${session.nextStep}` }));
  }

  return article;
};

const renderDetail = () => {
  const hobby = getHobbyByName(state.selectedDetailHobby);
  const sessionFeed = document.querySelector("#sessionFeed");

  if (!hobby) {
    document.querySelector("#hobby-detail-title").textContent = "No hobby selected";
    document.querySelector("#hobbyDetailMeta").textContent = "Current focus: Add a hobby to see progress here.";
    document.querySelector("#detailWeek").textContent = "0m";
    document.querySelector("#detailGoal").textContent = "of 0m goal";
    document.querySelector("#detailProgress").style.width = "0%";
    document.querySelector("#detailSessions").textContent = "0";
    document.querySelector("#detailSessionsMeta").textContent = "sessions this week";
    document.querySelector("#detailLast").textContent = "Not yet";
    document.querySelector("#detailLastExact").textContent = "No sessions logged";
    sessionFeed.replaceChildren(
      createEmptyState("No sessions yet", "Add a hobby, then log your first session.")
    );
    return;
  }

  const total = getWeeklyMinutes(hobby);
  const weeklySessions = hobby.sessions.filter((session) => isThisWeek(session.createdAt));
  const progress = Math.min(Math.round((total / hobby.goal) * 100), 100);
  const lastSession = hobby.sessions[0];
  const lastRelative = lastSession ? getRelativeDateLabel(lastSession.createdAt) : "";

  document.querySelector("#hobby-detail-title").textContent = hobby.name;
  document.querySelector("#hobbyDetailMeta").textContent = `Current focus: ${hobby.plan}`;
  document.querySelector("#detailWeek").textContent = formatMinutes(total);
  document.querySelector("#detailGoal").textContent = `${progress}% of ${formatMinutes(hobby.goal)} weekly goal`;
  document.querySelector("#detailProgress").style.width = `${progress}%`;
  document.querySelector("#detailSessions").textContent = weeklySessions.length;
  document.querySelector("#detailSessionsMeta").textContent = `${pluralize(
    weeklySessions.length,
    "session"
  )} this week`;
  document.querySelector("#detailLast").textContent = lastSession
    ? lastRelative || formatSessionDate(lastSession.createdAt)
    : "Not yet";
  document.querySelector("#detailLastExact").textContent = lastSession
    ? formatExactDate(lastSession.createdAt)
    : "No sessions logged";

  sessionFeed.replaceChildren();

  if (hobby.sessions.length) {
    const sessionItems = hobby.sessions.map((session) =>
      createTimelineItem({ ...session, hobbyName: "" })
    );
    sessionFeed.append(...sessionItems);
  } else {
    sessionFeed.append(
      createEmptyState("No sessions yet", "Log one session to start building history.")
    );
  }
};

const renderApp = () => {
  if (!appStatus) {
    return;
  }

  appStatus.textContent = state.storageAvailable === false
    ? "Storage unavailable"
    : state.storageNotice
      ? "Local data reset"
      : state.signedIn
        ? `${getPlanLabel()} - ${state.user.name || "signed in"}`
        : "Signed out";

  renderSelects();
  if (sessionDate) {
    sessionDate.max = toISODate(new Date());
    sessionDate.value ||= toISODate(new Date());
  }
  renderDashboard();
  renderDetail();
};

document.querySelectorAll("[data-open-auth]").forEach((link) => {
  link.addEventListener("click", (event) => {
    const selectedPlan = event.currentTarget.dataset.plan;
    if (selectedPlan) {
      state.selectedPlan = selectedPlan;
    }
    setView(state.signedIn ? (state.onboarded ? "dashboard" : "onboarding") : "auth");
  });
});

authModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.authMode = button.dataset.authMode;
    authModeButtons.forEach((item) => {
      const isActive = item === button;
      item.classList.toggle("active", isActive);
      item.setAttribute("aria-selected", String(isActive));
    });
    authName.closest("label").style.display = state.authMode === "signup" ? "grid" : "none";
  });
});

authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const email = authEmail.value.trim();
  const password = authPassword.value;
  const name = authName.value.trim();

  if (!email || !email.includes("@")) {
    setMessage(authMessage, "Enter a valid email address.");
    return;
  }

  if (password.length < 8) {
    setMessage(authMessage, "Use at least 8 characters for the password.");
    return;
  }

  if (state.authMode === "signup" && name.length < 2) {
    setMessage(authMessage, "Add your name so the dashboard feels personal.");
    return;
  }

  if (state.authMode === "signup" && containsMarkupCharacters(name)) {
    setMessage(authMessage, "Use plain text for your name.");
    return;
  }

  state.signedIn = true;
  state.user.email = email;
  state.user.name =
    state.authMode === "signup"
      ? name
      : state.user.name || state.user.email.split("@")[0] || "Sam";
  authPassword.value = "";
  setView(!state.onboarded ? "onboarding" : "dashboard");
});

onboardingForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = firstHobby.value.trim();
  const nextStep = firstNextStep.value.trim();
  const type = hobbyType.value;

  if (!name) {
    setMessage(onboardingMessage, "Add one hobby or skill you want to improve first.");
    return;
  }

  if (!hasReadableCharacters(name) || containsMarkupCharacters(name) || name.length > 40) {
    setMessage(onboardingMessage, "Use a readable hobby name under 40 characters.");
    return;
  }

  if (!nextStep || nextStep.length < 4 || containsMarkupCharacters(nextStep)) {
    setMessage(onboardingMessage, "Add one clear first action, like practice for 20 minutes or finish one small exercise.");
    return;
  }

  state.weeklyGoal = Number(weeklyGoal.value);
  state.firstHobby = name;
  state.onboarded = true;
  state.hobbies = [
    {
      id: name.toLowerCase().replace(/\s+/g, "-"),
      name,
      category: type,
      goal: state.weeklyGoal,
      plan: nextStep,
      sessions: [],
      streak: 0,
    },
  ];
  state.selectedDetailHobby = state.firstHobby;
  setView("dashboard");
});

addHobbyForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = document.querySelector("#newHobbyName").value.trim();
  const goal = Number(document.querySelector("#newHobbyGoal").value);
  const plan = document.querySelector("#newHobbyPlan").value.trim();
  const existing = state.hobbies.find(
    (hobby) => hobby.name.toLowerCase() === name.toLowerCase()
  );

  if (!name) {
    setMessage(addHobbyMessage, "Add a hobby name.");
    return;
  }

  if (!hasReadableCharacters(name) || containsMarkupCharacters(name)) {
    setMessage(addHobbyMessage, "Use a readable hobby name without markup characters.");
    return;
  }

  if (name.length > 40) {
    setMessage(addHobbyMessage, "Keep hobby names under 40 characters.");
    return;
  }

  if (containsMarkupCharacters(plan)) {
    setMessage(addHobbyMessage, "Keep the next step as plain text.");
    return;
  }

  if (!plan || plan.length < 4) {
    setMessage(addHobbyMessage, "Add one clear next step for this hobby.");
    return;
  }

  if (!existing && state.hobbies.length >= getPlanLimit()) {
    setMessage(
      addHobbyMessage,
      "The Free plan supports 3 hobbies. Pro with unlimited hobbies is coming soon."
    );
    return;
  }

  if (existing) {
    existing.name = name;
    existing.goal = goal;
    existing.plan = plan;
  } else {
    state.hobbies.push({
      id: name.toLowerCase().replace(/\s+/g, "-"),
      name,
      goal,
      plan,
      streak: 1,
      sessions: [],
    });
  }

  state.selectedDetailHobby = name;
  addHobbyForm.reset();
  setView("dashboard");
});

logSessionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const hobby = getHobbyByName(sessionHobby.value);
  const minutes = Number(document.querySelector("#sessionMinutes").value);
  const createdAt = document.querySelector("#sessionDate").value;
  const focus = document.querySelector("#sessionFocus").value.trim();
  const note = document.querySelector("#sessionNote").value.trim();
  const nextStep = document.querySelector("#sessionNextStep").value.trim();
  const milestone = document.querySelector("#sessionMilestone").value.trim();

  if (!hobby) {
    setMessage(logSessionMessage, "Add a hobby first, then come back here to log the session.");
    return;
  }

  if (!Number.isFinite(minutes) || minutes < 5 || minutes > 360) {
    setMessage(logSessionMessage, "Session length must be between 5 and 360 minutes.");
    return;
  }

  if (!isValidISODate(createdAt) || isFutureDate(createdAt)) {
    setMessage(logSessionMessage, "Choose today or a past date for the session.");
    return;
  }

  if (note.length < 3) {
    setMessage(logSessionMessage, "Add a short note about what you practiced.");
    return;
  }

  if (focus.length < 3 || containsMarkupCharacters(focus)) {
    setMessage(logSessionMessage, "Add a short plain-text focus for this session.");
    return;
  }

  if (focus.length > 120) {
    setMessage(logSessionMessage, "Keep the session focus under 120 characters.");
    return;
  }

  if (!hasReadableCharacters(note) || containsMarkupCharacters(note)) {
    setMessage(logSessionMessage, "Use plain text for the session note.");
    return;
  }

  if (note.length > 500) {
    setMessage(logSessionMessage, "Keep session notes under 500 characters.");
    return;
  }

  if (nextStep.length < 3 || containsMarkupCharacters(nextStep)) {
    setMessage(logSessionMessage, "Add a short plain-text next step for next time.");
    return;
  }

  if (nextStep.length > 120) {
    setMessage(logSessionMessage, "Keep the next step under 120 characters.");
    return;
  }

  if (containsMarkupCharacters(milestone)) {
    setMessage(logSessionMessage, "Use plain text for milestones.");
    return;
  }

  if (milestone.length > 120) {
    setMessage(logSessionMessage, "Keep milestones under 120 characters.");
    return;
  }

  hobby.sessions.unshift({
    createdAt,
    minutes,
    focus,
    note,
    nextStep,
    milestone,
  });
  hobby.sessions = hobby.sessions.slice(0, MAX_SESSIONS_PER_HOBBY);
  hobby.plan = nextStep;
  hobby.streak = calculateStreak(hobby);
  state.selectedDetailHobby = hobby.name;
  logSessionForm.reset();
  document.querySelector("#sessionMinutes").value = 25;
  document.querySelector("#sessionDate").value = toISODate(new Date());
  setView("hobby-detail");
});

detailHobbySelect.addEventListener("change", () => {
  state.selectedDetailHobby = detailHobbySelect.value;
  renderDetail();
  saveState();
});

document.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view-target]");
  const hobbyButton = event.target.closest("[data-detail-hobby]");

  if (viewButton) {
    setView(viewButton.dataset.viewTarget);
  }

  if (hobbyButton) {
    state.selectedDetailHobby = hobbyButton.dataset.detailHobby;
    setView("hobby-detail");
  }
});

document.querySelector("[data-sign-out]").addEventListener("click", () => {
  state.signedIn = false;
  setView("auth");
});

document.querySelector("[data-reset-app]").addEventListener("click", () => {
  const confirmed = window.confirm("Reset all local HobbyTrack data on this device?");

  if (!confirmed) {
    return;
  }

  localStorage.removeItem(STORAGE_KEY);
  state = createDefaultState();
  authForm.reset();
  addHobbyForm.reset();
  logSessionForm.reset();
  setView("auth");
});

authModeButtons.forEach((button) => {
  const isActive = button.dataset.authMode === state.authMode;
  button.classList.toggle("active", isActive);
  button.setAttribute("aria-selected", String(isActive));
});
authName.closest("label").style.display = state.authMode === "signup" ? "grid" : "none";

const initialView = state.signedIn
  ? !state.onboarded
    ? "onboarding"
    : state.currentView === "auth"
      ? "dashboard"
      : state.currentView || "dashboard"
  : "auth";

setView(initialView);
