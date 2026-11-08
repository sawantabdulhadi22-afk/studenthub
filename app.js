
/* =========================================================
   STUDENTHUB - COMPLETE FRONTEND
   Supabase Authentication + Dashboard + Study Resources
   Admin Resource Manager + Homework Writer + Study Planner
   ========================================================= */

/* 1. SUPABASE CONFIGURATION */

const cfg = window.STUDENTHUB_CONFIG || {};

const configured = Boolean(
  cfg.SUPABASE_URL &&
  cfg.SUPABASE_PUBLISHABLE_KEY &&
  !cfg.SUPABASE_URL.includes("PASTE_") &&
  !cfg.SUPABASE_PUBLISHABLE_KEY.includes("PASTE_")
);

const sb = configured && window.supabase
  ? window.supabase.createClient(
      cfg.SUPABASE_URL,
      cfg.SUPABASE_PUBLISHABLE_KEY
    )
  : null;

let currentUser = null;
let currentProfile = null;
let currentAnswers = [];
let currentWatermark = false;
let currentJobId = null;
let selectedQuestionFile = null;
let selectedTemplateFile = null;
let usageToday = 0;
let savedItems = [];
let tasks = [];
let editingResourceId = null;

const $ = id => document.getElementById(id);


/* 2. GENERAL HELPERS */

function toast(message) {
  const el = $("toast");
  if (!el) {
    console.log(message);
    return;
  }

  el.textContent = message;
  el.classList.add("show");

  setTimeout(() => el.classList.remove("show"), 3400);
}

function setStatus(message, error = false) {
  const el = $("homeworkStatus");
  if (!el) return;

  el.textContent = message;
  el.style.color = error ? "#b04444" : "#718096";
}

function safeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function showAuth(which) {
  [
    "loginForm",
    "signupForm",
    "resetForm",
    "newPasswordForm"
  ].forEach(id => $(id)?.classList.add("hidden"));

  $(which)?.classList.remove("hidden");
}

function showApp() {
  $("authScreen")?.classList.add("hidden");
  $("appShell")?.classList.remove("hidden");
}

function showAuthScreen() {
  $("appShell")?.classList.add("hidden");
  $("authScreen")?.classList.remove("hidden");
}

function pageName(page) {
  return ({
    dashboard: "Dashboard",
    resources: "Study resources",
    homework: "AI Homework Writer",
    planner: "Study planner",
    library: "My library",
    progress: "Progress",
    membership: "Membership",
    profile: "My profile",
    admin: "Admin dashboard"
  })[page] || "Dashboard";
}


/* 3. NAVIGATION */

function navigate(page) {
  if (page === "admin" && currentProfile?.role !== "admin") {
    toast("Admin access only.");
    return;
  }

  document.querySelectorAll(".page").forEach(el => {
    el.classList.remove("active");
  });

  const target = $("page-" + page);
  if (target) target.classList.add("active");

  document.querySelectorAll(".nav-item[data-page]").forEach(el => {
    el.classList.toggle("active", el.dataset.page === page);
  });

  if ($("topPageTitle")) {
    $("topPageTitle").textContent = pageName(page);
  }

  $("sidebar")?.classList.remove("open");

  if (page === "library") renderLibrary();
  if (page === "planner") renderTasks();
  if (page === "progress") refreshStats();
  if (page === "admin") loadAdminResources();
}

function setupNavigation() {
  document.querySelectorAll("[data-page]").forEach(button => {
    button.addEventListener("click", () => {
      navigate(button.dataset.page);
    });
  });

  document.querySelectorAll("[data-go]").forEach(button => {
    button.addEventListener("click", () => {
      navigate(button.dataset.go);
    });
  });

  if ($("menuBtn")) {
    $("menuBtn").onclick = () => {
      $("sidebar")?.classList.toggle("open");
    };
  }
}


/* 4. PROFILE */

async function loadProfile() {
  if (!sb || !currentUser) return;

  const { data, error } = await sb
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) console.warn("Profile error:", error);

  currentProfile = data || {
    id: currentUser.id,
    full_name:
      currentUser.user_metadata?.full_name ||
      currentUser.email?.split("@")[0],
    plan: "free",
    role: "student"
  };

  const name = currentProfile.full_name || "Student";
  const firstName = name.split(" ")[0];
  const initial = firstName[0]?.toUpperCase() || "S";
  const plan = (currentProfile.plan || "free").toUpperCase();

  if ($("topName")) $("topName").textContent = name;
  if ($("welcomeName")) $("welcomeName").textContent = firstName;
  if ($("avatar")) $("avatar").textContent = initial;
  if ($("profileAvatar")) $("profileAvatar").textContent = initial;

  if ($("topPlan")) $("topPlan").textContent = plan + " PLAN";
  if ($("sidePlan")) $("sidePlan").textContent = plan + " plan";

  if ($("sideUsage")) {
    $("sideUsage").textContent =
      currentProfile.plan === "pro"
        ? "Higher fair-use limit"
        : "2 homework PDFs daily";
  }

  if ($("planStat")) $("planStat").textContent = plan;

  $("adminNav")?.classList.toggle(
    "hidden",
    currentProfile.role !== "admin"
  );

  if ($("profileName")) {
    $("profileName").value = currentProfile.full_name || "";
  }

  if ($("profileEmail")) {
    $("profileEmail").value = currentUser.email || "";
  }

  if ($("profileEducation")) {
    $("profileEducation").value = currentProfile.education || "";
  }
}


/* 5. USAGE AND PROGRESS */

async function refreshUsage() {
  if (!sb || !currentUser) return;

  const indiaNow = new Date(
    new Date().toLocaleString("en-US", {
      timeZone: "Asia/Kolkata"
    })
  );

  indiaNow.setHours(0, 0, 0, 0);

  const indiaDayStart = new Date(
    indiaNow.getTime() - 5.5 * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await sb
    .from("homework_jobs")
    .select("id,created_at,status")
    .eq("user_id", currentUser.id)
    .gte("created_at", indiaDayStart)
    .in("status", ["processing", "completed"]);

  if (!error) usageToday = data.length;

  if ($("pdfCount")) {
    $("pdfCount").textContent =
      currentProfile?.plan === "pro"
        ? `${usageToday} / 50`
        : `${usageToday} / 2`;
  }

  if ($("homeworkUsage")) {
    $("homeworkUsage").textContent =
      currentProfile?.plan === "pro"
        ? "Pro plan: higher fair-use generation limit. No StudentHub watermark."
        : "Free plan: 2 completed PDFs per day. Your second PDF includes a StudentHub watermark.";
  }
}

function refreshStats() {
  const saved = savedItems.length;
  const done = tasks.filter(task => task.is_done).length;
  const pending = tasks.filter(task => !task.is_done).length;

  ["savedCount", "progressSaved"].forEach(id => {
    if ($(id)) $(id).textContent = saved;
  });

  if ($("taskCount")) $("taskCount").textContent = pending;
  if ($("progressTasks")) $("progressTasks").textContent = done;
  if ($("progressPdfs")) $("progressPdfs").textContent = usageToday;
}

async function loadPrivateData() {
  if (!sb || !currentUser) return;

  const [savedResult, taskResult] = await Promise.all([
    sb.from("saved_items")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false }),

    sb.from("study_tasks")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false })
  ]);

  savedItems = savedResult.data || [];
  tasks = taskResult.data || [];

  if (savedResult.error) console.warn(savedResult.error);
  if (taskResult.error) console.warn(taskResult.error);

  renderTasks();
  renderLibrary();
  refreshStats();
  await refreshUsage();
}

async function enterApp(user) {
  currentUser = user;

  showApp();

  await loadProfile();
  await loadPrivateData();

  if ($("todayDate")) {
    $("todayDate").textContent = new Date().toLocaleDateString(
      undefined,
      {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric"
      }
    );
  }
}


/* 6. AUTHENTICATION */

function setupAuth() {
  if ($("showSignup")) {
    $("showSignup").onclick = () => showAuth("signupForm");
  }

  if ($("showLogin")) {
    $("showLogin").onclick = () => showAuth("loginForm");
  }

  if ($("forgotLink")) {
    $("forgotLink").onclick = () => {
      showAuth("resetForm");

      if ($("resetEmail") && $("loginEmail")) {
        $("resetEmail").value = $("loginEmail").value;
      }
    };
  }

  if ($("backToLogin")) {
    $("backToLogin").onclick = () => showAuth("loginForm");
  }

  if ($("signInForm")) {
    $("signInForm").onsubmit = async event => {
      event.preventDefault();

      if (!sb) {
        return toast("Configure Supabase in config.js first.");
      }

      const { data, error } = await sb.auth.signInWithPassword({
        email: $("loginEmail").value.trim(),
        password: $("loginPassword").value
      });

      if (error) return toast(error.message);

      await enterApp(data.user);
      toast("Welcome back!");
    };
  }

  if ($("registerForm")) {
    $("registerForm").onsubmit = async event => {
      event.preventDefault();

      if (!sb) return toast("Configure Supabase first.");

      const name = $("signupName").value.trim();
      const email = $("signupEmail").value.trim();
      const password = $("signupPassword").value;

      if (password !== $("signupConfirm").value) {
        return toast("Passwords do not match.");
      }

      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: location.origin + location.pathname
        }
      });

      if (error) return toast(error.message);

      if (data.session) {
        await enterApp(data.user);
        toast("Account created.");
      } else {
        toast("Account created. Check your email to verify it, then log in.");
      }
    };
  }

  if ($("resetPasswordForm")) {
    $("resetPasswordForm").onsubmit = async event => {
      event.preventDefault();

      if (!sb) return toast("Configure Supabase first.");

      const { error } = await sb.auth.resetPasswordForEmail(
        $("resetEmail").value.trim(),
        {
          redirectTo: location.origin + location.pathname
        }
      );

      if (error) return toast(error.message);

      toast("Password reset email sent.");
    };
  }

  if ($("updatePasswordForm")) {
    $("updatePasswordForm").onsubmit = async event => {
      event.preventDefault();

      const { error } = await sb.auth.updateUser({
        password: $("newPassword").value
      });

      if (error) return toast(error.message);

      toast("Password updated.");
      showAuth("loginForm");
    };
  }

  if ($("logoutBtn")) {
    $("logoutBtn").onclick = async () => {
      if (sb) await sb.auth.signOut();

      currentUser = null;
      currentProfile = null;

      showAuthScreen();
      showAuth("loginForm");
    };
  }
}


/* 7. EDUCATION OPTIONS */

const branches = {
  "Diploma": [
    "Mechanical Engineering",
    "Civil Engineering",
    "Computer Engineering",
    "Electrical Engineering",
    "Automobile Engineering"
  ],

  "Class 11": [
    "Science - PCM",
    "Science - PCB",
    "Commerce",
    "Arts"
  ],

  "Class 12": [
    "Science - PCM",
    "Science - PCB",
    "Commerce",
    "Arts"
  ],

  "B.Tech": [
    "Computer Science",
    "Mechanical Engineering",
    "Civil Engineering",
    "Electrical Engineering",
    "Electronics & Communication"
  ],

  "ITI": [
    "Fitter",
    "Electrician",
    "Welder",
    "Turner",
    "Mechanic Motor Vehicle"
  ]
};

const boards = {
  "Diploma": [
    "MSBTE Maharashtra",
    "BTEUP Uttar Pradesh",
    "DTE Karnataka",
    "TNDOTE Tamil Nadu",
    "WBSCTE West Bengal",
    "Other Board"
  ],

  "Class 11": [
    "Maharashtra State Board",
    "CBSE",
    "ISC",
    "Other Board"
  ],

  "Class 12": [
    "Maharashtra State Board",
    "CBSE",
    "ISC",
    "Other Board"
  ],

  "B.Tech": [
    "University / Autonomous",
    "Mumbai University",
    "SPPU Pune",
    "Other University"
  ],

  "ITI": [
    "NCVT",
    "SCVT",
    "Other Board"
  ]
};

const subjects = {
  "Mechanical Engineering": [
    "Engineering Mathematics",
    "Applied Physics",
    "Applied Chemistry",
    "Engineering Graphics",
    "Workshop Practice",
    "Strength of Materials",
    "Fluid Mechanics",
    "Manufacturing Technology",
    "Automobile Engineering",
    "Theory of Machines"
  ],

  "Civil Engineering": [
    "Engineering Mathematics",
    "Applied Physics",
    "Engineering Graphics",
    "Building Materials",
    "Surveying",
    "Strength of Materials",
    "Fluid Mechanics",
    "Concrete Technology"
  ],

  "Computer Engineering": [
    "Engineering Mathematics",
    "Applied Physics",
    "Programming in C",
    "Computer Fundamentals",
    "Data Structures",
    "Database Management",
    "Computer Networks",
    "Web Technology"
  ],

  "Electrical Engineering": [
    "Engineering Mathematics",
    "Applied Physics",
    "Basic Electrical Engineering",
    "Electrical Machines",
    "Power Systems",
    "Measurements",
    "Electronics"
  ],

  "Automobile Engineering": [
    "Engineering Mathematics",
    "Applied Physics",
    "Automobile Engines",
    "Vehicle Chassis",
    "Automotive Transmission",
    "Vehicle Maintenance",
    "Automobile Electrical Systems"
  ],

  "Science - PCM": [
    "Physics",
    "Chemistry",
    "Mathematics",
    "English",
    "Computer Science"
  ],

  "Science - PCB": [
    "Physics",
    "Chemistry",
    "Biology",
    "English",
    "Environmental Education"
  ],

  "Commerce": [
    "Accountancy",
    "Economics",
    "Business Studies",
    "Mathematics",
    "English"
  ],

  "Arts": [
    "History",
    "Geography",
    "Political Science",
    "Psychology",
    "Sociology",
    "English"
  ],

  "Computer Science": [
    "Engineering Mathematics",
    "Programming",
    "Data Structures",
    "Database Systems",
    "Operating Systems",
    "Computer Networks"
  ],

  "Electronics & Communication": [
    "Engineering Mathematics",
    "Electronic Devices",
    "Digital Electronics",
    "Communication Systems",
    "Microprocessors"
  ],

  "Fitter": [
    "Workshop Calculation",
    "Engineering Drawing",
    "Fitting",
    "Welding",
    "Safety"
  ],

  "Electrician": [
    "Electrical Fundamentals",
    "Wiring",
    "Electrical Machines",
    "Measurements",
    "Safety"
  ],

  "Welder": [
    "Welding Technology",
    "Engineering Drawing",
    "Workshop Calculation",
    "Safety"
  ],

  "Turner": [
    "Turning Operations",
    "Engineering Drawing",
    "Workshop Calculation",
    "Machine Tools"
  ],

  "Mechanic Motor Vehicle": [
    "Automobile Engines",
    "Vehicle Systems",
    "Workshop Practice",
    "Electrical Systems"
  ]
};

function fillSelect(id, items, placeholder) {
  const select = $(id);
  if (!select) return;

  select.innerHTML = "";
  select.add(new Option(placeholder, ""));

  (items || []).forEach(item => {
    select.add(new Option(item, item));
  });
}

function updateEducation() {
  const course = $("course")?.value;

  fillSelect("board", boards[course], "Select board");
  fillSelect("branch", branches[course], "Select stream or branch");
  fillSelect("term", [], "Select semester or year");
  fillSelect("subject", [], "Select subject");

  if ($("resourceTitle")) {
    $("resourceTitle").textContent = "Choose a subject first";
  }

  if ($("resourceGrid")) $("resourceGrid").innerHTML = "";

  if ($("selectionMessage")) {
    $("selectionMessage").textContent =
      "Select your education details to continue.";
  }

  $("resourcePreview")?.classList.add("hidden");
}

function updateBranch() {
  const course = $("course")?.value;

  const terms =
    course === "Diploma"
      ? ["Semester 1", "Semester 2", "Semester 3", "Semester 4", "Semester 5", "Semester 6"]
      : course === "Class 11"
        ? ["Class 11"]
        : course === "Class 12"
          ? ["Class 12"]
          : course === "B.Tech"
            ? ["Year 1", "Year 2", "Year 3", "Year 4"]
            : ["Year 1", "Year 2"];

  fillSelect("term", terms, "Select semester or year");

  fillSelect(
    "subject",
    subjects[$("branch")?.value] || [],
    "Select subject"
  );

  renderResourceCards();
}

function updateTerm() {
  fillSelect(
    "subject",
    subjects[$("branch")?.value] || [],
    "Select subject"
  );

  renderResourceCards();
}

function setupEducation() {
  if ($("course")) $("course").onchange = updateEducation;
  if ($("board")) $("board").onchange = updateBranch;
  if ($("branch")) $("branch").onchange = updateBranch;
  if ($("term")) $("term").onchange = updateTerm;
  if ($("subject")) $("subject").onchange = renderResourceCards;
}


/* 8. STUDY RESOURCES */

const resourceTypes = [
  ["Notes", "▤", "Chapter-wise explanations and revision notes."],
  ["Important Questions", "✦", "Short and long-answer practice questions."],
  ["Previous Year Questions", "▣", "Verified previous examination papers."],
  ["Solved Answers", "✎", "Structured descriptive answers and explanations."],
  ["MCQ Practice", "☷", "Multiple-choice questions with explanations."],
  ["Numericals", "∑", "Step-by-step numerical practice."],
  ["Diagrams", "◇", "Subject diagrams and labelled illustrations."],
  ["Formula Sheet", "ƒ", "Important formulas and units."]
];

function renderResourceCards() {
  const subject = $("subject")?.value;
  const grid = $("resourceGrid");

  if (!grid) return;

  if (!subject) {
    grid.innerHTML = "";
    return;
  }

  if ($("resourceTitle")) {
    $("resourceTitle").textContent = subject + " resources";
  }

  if ($("selectionMessage")) {
    $("selectionMessage").textContent =
      `Selected: ${$("course").value} · ${$("branch").value} · ${$("term").value || "Term not selected"} · ${subject}`;
  }

  grid.innerHTML = resourceTypes.map(([name, icon, description]) => `
    <article class="resource-card">
      <span class="res-icon">${icon}</span>
      <h3>${safeText(name)}</h3>
      <p>${safeText(description)}</p>
      <div class="resource-actions">
        <button class="small-btn" data-resource="${safeText(name)}">Open</button>
        <button class="small-btn" data-save="${safeText(name)}">☆ Save</button>
      </div>
    </article>
  `).join("");

  grid.querySelectorAll("[data-resource]").forEach(button => {
    button.onclick = () => {
      openResource(button.dataset.resource, subject);
    };
  });

  grid.querySelectorAll("[data-save]").forEach(button => {
    button.onclick = () => {
      saveResource(button.dataset.save, subject);
    };
  });
}

async function sampleContent(type, subject) {
  const preview = $("previewBody");
  if (!preview || !sb) return;

  preview.innerHTML = `
    <p class="muted">Loading ${safeText(type)}...</p>
  `;

  try {
    let query = sb
      .from("study_resources")
      .select("id,title,content,source_label,exam_year,chapter,scheme,course,board,branch,term")
      .eq("subject", subject)
      .eq("resource_type", type)
      .eq("is_published", true);

    const course = $("course")?.value;
    const board = $("board")?.value;
    const branch = $("branch")?.value;
    const term = $("term")?.value;

    if (course) query = query.eq("course", course);
    if (board) query = query.eq("board", board);
    if (branch) query = query.eq("branch", branch);
    if (term) query = query.eq("term", term);

    const { data, error } = await query.order(
      "created_at",
      { ascending: false }
    );

    if (error) throw error;

    if (!data || data.length === 0) {
      preview.innerHTML = `
        <h3>${safeText(type)}</h3>
        <p>No ${safeText(type)} have been published for
        ${safeText(subject)} yet.</p>
        <p class="muted">
          Please check again after resources are added by the admin.
        </p>
      `;
      return;
    }

    preview.innerHTML = data.map(item => `
      <article class="resource-content">
        <h3>${safeText(item.title)}</h3>
        ${item.chapter ? `<p><b>Chapter:</b> ${safeText(item.chapter)}</p>` : ""}
        ${item.exam_year ? `<p><b>Exam year:</b> ${safeText(item.exam_year)}</p>` : ""}
        ${item.scheme ? `<p><b>Scheme:</b> ${safeText(item.scheme)}</p>` : ""}
        <div class="resource-answer">
          ${safeText(item.content).replace(/\n/g, "<br>")}
        </div>
        ${item.source_label ? `<p class="muted">Source: ${safeText(item.source_label)}</p>` : ""}
      </article>
      <hr>
    `).join("");

  } catch (error) {
    console.error("Resource loading error:", error);

    preview.innerHTML = `
      <p>Unable to load resources. Please try again.</p>
    `;
  }
}

async function openResource(type, subject) {
  $("resourcePreview")?.classList.remove("hidden");

  if ($("previewTitle")) {
    $("previewTitle").textContent = type + " · " + subject;
  }

  $("resourcePreview")?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

  await sampleContent(type, subject);
}

if ($("closePreview")) {
  $("closePreview").onclick = () => {
    $("resourcePreview")?.classList.add("hidden");
  };
}


/* 9. SAVED RESOURCES */

async function saveResource(type, subject) {
  if (!sb || !currentUser) return toast("Please log in first.");

  const item = {
    title: type,
    subject,
    course: $("course")?.value,
    branch: $("branch")?.value
  };

  if (savedItems.some(x =>
    x.title === item.title && x.subject === item.subject
  )) {
    return toast("Already saved.");
  }

  const { data, error } = await sb
    .from("saved_items")
    .insert({
      user_id: currentUser.id,
      title: item.title,
      subject: item.subject,
      details: item
    })
    .select()
    .single();

  if (error) return toast(error.message);

  savedItems.unshift(data);

  renderLibrary();
  refreshStats();

  toast("Saved to your library.");
}

function renderLibrary() {
  const el = $("libraryList");
  if (!el) return;

  if (!savedItems.length) {
    el.innerHTML = `
      <div class="panel muted">
        No saved resources yet. Open Study resources and press Save.
      </div>
    `;
    return;
  }

  el.innerHTML = savedItems.map(item => `
    <article class="resource-card">
      <span class="res-icon">☆</span>
      <h3>${safeText(item.title)}</h3>
      <p>${safeText(item.subject || "")}</p>
      <button class="small-btn" data-remove="${safeText(item.id)}">
        Remove
      </button>
    </article>
  `).join("");

  el.querySelectorAll("[data-remove]").forEach(button => {
    button.onclick = async () => {
      const { error } = await sb
        .from("saved_items")
        .delete()
        .eq("id", button.dataset.remove);

      if (error) return toast(error.message);

      savedItems = savedItems.filter(
        item => item.id !== button.dataset.remove
      );

      renderLibrary();
      refreshStats();
    };
  });
}


/* 10. STUDY PLANNER */

async function addTask(title, due) {
  if (!sb || !currentUser) return toast("Please log in first.");

  if (!title) return toast("Enter a task first.");

  const { data, error } = await sb
    .from("study_tasks")
    .insert({
      user_id: currentUser.id,
      title,
      due_date: due || null
    })
    .select()
    .single();

  if (error) return toast(error.message);

  tasks.unshift(data);

  renderTasks();
  refreshStats();
}

function renderTasks() {
  const el = $("taskList");
  if (!el) return;

  if (!tasks.length) {
    el.innerHTML = `
      <p class="muted tiny">
        No tasks yet. Add your first study task.
      </p>
    `;
    return;
  }

  el.innerHTML = tasks.map(task => `
    <div class="task-row ${task.is_done ? "done" : ""}">
      <input
        type="checkbox"
        data-task="${safeText(task.id)}"
        ${task.is_done ? "checked" : ""}
      >
      <span class="task-text">${safeText(task.title)}</span>
      <small>${task.due_date ? safeText(task.due_date) : ""}</small>
      <button
        class="small-btn"
        data-delete-task="${safeText(task.id)}"
      >×</button>
    </div>
  `).join("");

  el.querySelectorAll("[data-task]").forEach(checkbox => {
    checkbox.onchange = async () => {
      const { error } = await sb
        .from("study_tasks")
        .update({ is_done: checkbox.checked })
        .eq("id", checkbox.dataset.task);

      if (error) return toast(error.message);

      const task = tasks.find(
        item => item.id === checkbox.dataset.task
      );

      if (task) task.is_done = checkbox.checked;

      renderTasks();
      refreshStats();
    };
  });

  el.querySelectorAll("[data-delete-task]").forEach(button => {
    button.onclick = async () => {
      const { error } = await sb
        .from("study_tasks")
        .delete()
        .eq("id", button.dataset.deleteTask);

      if (error) return toast(error.message);

      tasks = tasks.filter(
        task => task.id !== button.dataset.deleteTask
      );

      renderTasks();
      refreshStats();
    };
  });
}

if ($("taskForm")) {
  $("taskForm").onsubmit = async event => {
    event.preventDefault();

    await addTask(
      $("taskInput").value.trim(),
      $("taskDate").value
    );

    $("taskInput").value = "";
    $("taskDate").value = "";
  };
}


/* 11. PROFILE UPDATE */

if ($("saveProfile")) {
  $("saveProfile").onclick = async () => {
    const { error } = await sb
      .from("profiles")
      .update({
        full_name: $("profileName").value.trim(),
        education: $("profileEducation").value || null
      })
      .eq("id", currentUser.id);

    if (error) return toast(error.message);

    await loadProfile();
    toast("Profile updated.");
  };
}


/* 12. ADMIN RESOURCE MANAGER */

const adminResourceTypes = [
  "Notes",
  "Important Questions",
  "Previous Year Questions",
  "Solved Answers",
  "MCQ Practice",
  "Numericals",
  "Diagrams",
  "Formula Sheet"
];

function renderAdminPanel() {
  const page = $("page-admin");
  if (!page || currentProfile?.role !== "admin") return;

  page.innerHTML = `
    <div class="panel">
      <h2>StudentHub Resource Manager</h2>
      <p class="muted">
        Add educational content, review it and publish it for students.
      </p>

      <form id="adminResourceForm">
        <h3 id="adminFormHeading">Add new resource</h3>

        <label>Course</label>
        <input id="adminCourse" required placeholder="e.g. Diploma">

        <label>Board / University</label>
        <input id="adminBoard" placeholder="e.g. MSBTE Maharashtra">

        <label>Branch / Stream</label>
        <input id="adminBranch" placeholder="e.g. Mechanical Engineering">

        <label>Semester / Year</label>
        <input id="adminTerm" placeholder="e.g. Semester 3">

        <label>Subject</label>
        <input id="adminSubject" required placeholder="e.g. Manufacturing Technology">

        <label>Chapter</label>
        <input id="adminChapter" placeholder="Chapter name or number">

        <label>Resource type</label>
        <select id="adminType" required>
          ${adminResourceTypes.map(type =>
            `<option value="${safeText(type)}">${safeText(type)}</option>`
          ).join("")}
        </select>

        <label>Resource title</label>
        <input id="adminTitle" required placeholder="Enter resource title">

        <label>Content</label>
        <textarea
          id="adminContent"
          rows="12"
          required
          placeholder="Enter detailed notes, questions or answers here..."
        ></textarea>

        <label>Source / Reference</label>
        <input
          id="adminSource"
          placeholder="e.g. Official MSBTE paper or AI-generated practice"
        >

        <label>Exam year (optional)</label>
        <input id="adminYear" type="number" min="1900" max="2100">

        <label>Scheme (optional)</label>
        <input id="adminScheme" placeholder="e.g. K Scheme">

        <label>
          <input id="adminPublished" type="checkbox">
          Publish this resource
        </label>

        <div class="resource-actions">
          <button type="submit" class="small-btn" id="adminSubmit">
            Save resource
          </button>

          <button type="button" class="small-btn" id="adminCancel">
            Clear form
          </button>
        </div>

        <p id="adminStatus" class="muted"></p>
      </form>
    </div>

    <div class="panel">
      <h2>Published and draft resources</h2>
      <div id="adminResourceList">
        Loading resources...
      </div>
    </div>
  `;

  $("adminResourceForm").onsubmit = saveAdminResource;
  $("adminCancel").onclick = clearAdminForm;

  loadAdminResources();
}

function clearAdminForm() {
  editingResourceId = null;

  $("adminResourceForm")?.reset();

  if ($("adminFormHeading")) {
    $("adminFormHeading").textContent = "Add new resource";
  }

  if ($("adminSubmit")) {
    $("adminSubmit").textContent = "Save resource";
  }

  if ($("adminStatus")) $("adminStatus").textContent = "";
}

async function saveAdminResource(event) {
  event.preventDefault();

  if (currentProfile?.role !== "admin") {
    return toast("Admin access only.");
  }

  const yearValue = $("adminYear").value;

  const resource = {
    course: $("adminCourse").value.trim(),
    board: $("adminBoard").value.trim() || null,
    branch: $("adminBranch").value.trim() || null,
    term: $("adminTerm").value.trim() || null,
    subject: $("adminSubject").value.trim(),
    chapter: $("adminChapter").value.trim() || null,
    resource_type: $("adminType").value,
    title: $("adminTitle").value.trim(),
    content: $("adminContent").value.trim(),
    source_label: $("adminSource").value.trim() || null,
    exam_year: yearValue ? Number(yearValue) : null,
    scheme: $("adminScheme").value.trim() || null,
    is_published: $("adminPublished").checked
  };

  if (!resource.course || !resource.subject ||
      !resource.title || !resource.content) {
    return toast("Please fill in all required fields.");
  }

  const submitButton = $("adminSubmit");
  submitButton.disabled = true;
  submitButton.textContent = "Saving...";

  try {
    let result;

    if (editingResourceId) {
      result = await sb
        .from("study_resources")
        .update(resource)
        .eq("id", editingResourceId);
    } else {
      result = await sb
        .from("study_resources")
        .insert({
          ...resource,
          created_by: currentUser.id
        });
    }

    if (result.error) throw result.error;

    toast(editingResourceId
      ? "Resource updated successfully."
      : "Resource added successfully."
    );

    clearAdminForm();
    await loadAdminResources();

  } catch (error) {
    console.error("Admin save error:", error);

    $("adminStatus").textContent =
      error.message || "Could not save resource.";

    toast(error.message || "Could not save resource.");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = editingResourceId
      ? "Update resource"
      : "Save resource";
  }
}

async function loadAdminResources() {
  if (!sb || currentProfile?.role !== "admin") return;

  const list = $("adminResourceList");
  if (!list) return;

  list.innerHTML = "Loading resources...";

  const { data, error } = await sb
    .from("study_resources")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    list.innerHTML = `
      <p class="muted">
        Unable to load resources: ${safeText(error.message)}
      </p>
    `;
    return;
  }

  if (!data || data.length === 0) {
    list.innerHTML = `
      <p class="muted">No resources added yet.</p>
    `;
    return;
  }

  list.innerHTML = data.map(item => `
    <article class="resource-card">
      <h3>${safeText(item.title)}</h3>

      <p>${safeText(item.subject)} · ${safeText(item.resource_type)}</p>

      <p class="muted">
        ${safeText(item.course)} ·
        ${safeText(item.branch || "")} ·
        ${safeText(item.term || "")}
      </p>

      <p>
        Status:
        <b>${item.is_published ? "Published" : "Draft"}</b>
      </p>

      <div class="resource-actions">
        <button class="small-btn" data-edit-resource="${safeText(item.id)}">
          Edit
        </button>

        <button class="small-btn" data-toggle-resource="${safeText(item.id)}">
          ${item.is_published ? "Unpublish" : "Publish"}
        </button>

        <button class="small-btn" data-delete-resource="${safeText(item.id)}">
          Delete
        </button>
      </div>
    </article>
  `).join("");

  list.querySelectorAll("[data-edit-resource]").forEach(button => {
    button.onclick = () => {
      const item = data.find(
        resource => resource.id === button.dataset.editResource
      );

      if (item) editAdminResource(item);
    };
  });

  list.querySelectorAll("[data-toggle-resource]").forEach(button => {
    button.onclick = async () => {
      const item = data.find(
        resource => resource.id === button.dataset.toggleResource
      );

      if (!item) return;

      const { error } = await sb
        .from("study_resources")
        .update({ is_published: !item.is_published })
        .eq("id", item.id);

      if (error) return toast(error.message);

      toast("Resource status updated.");
      loadAdminResources();
    };
  });

  list.querySelectorAll("[data-delete-resource]").forEach(button => {
    button.onclick = async () => {
      if (!confirm("Delete this resource permanently?")) return;

      const { error } = await sb
        .from("study_resources")
        .delete()
        .eq("id", button.dataset.deleteResource);

      if (error) return toast(error.message);

      toast("Resource deleted.");
      loadAdminResources();
    };
  });
}

function editAdminResource(item) {
  editingResourceId = item.id;

  $("adminCourse").value = item.course || "";
  $("adminBoard").value = item.board || "";
  $("adminBranch").value = item.branch || "";
  $("adminTerm").value = item.term || "";
  $("adminSubject").value = item.subject || "";
  $("adminChapter").value = item.chapter || "";
  $("adminType").value = item.resource_type || "Notes";
  $("adminTitle").value = item.title || "";
  $("adminContent").value = item.content || "";
  $("adminSource").value = item.source_label || "";
  $("adminYear").value = item.exam_year || "";
  $("adminScheme").value = item.scheme || "";
  $("adminPublished").checked = !!item.is_published;

  $("adminFormHeading").textContent = "Edit resource";
  $("adminSubmit").textContent = "Update resource";

  $("page-admin").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}


/* 13. HOMEWORK WRITER - PDF QUESTION READER */

async function extractPdfText(file) {
  if (!window.pdfjsLib) {
    throw new Error(
      "PDF reader did not load. Paste your questions manually."
    );
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const bytes = await file.arrayBuffer();

  const pdf = await pdfjsLib.getDocument({
    data: bytes
  }).promise;

  let text = "";

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();

    text += content.items.map(item => item.str).join(" ") + "\n";
  }

  return text.trim();
}

if ($("questionPdf")) {
  $("questionPdf").onchange = event => {
    selectedQuestionFile = event.target.files[0] || null;

    if ($("questionFileName")) {
      $("questionFileName").textContent =
        selectedQuestionFile
          ? selectedQuestionFile.name
          : "No assignment selected";
    }
  };
}

if ($("paperTemplate")) {
  $("paperTemplate").onchange = event => {
    selectedTemplateFile = event.target.files[0] || null;

    if ($("paperFileName")) {
      $("paperFileName").textContent =
        selectedTemplateFile
          ? selectedTemplateFile.name
          : "No paper template selected";
    }
  };
}

function renderAnswers() {
  const box = $("answerPreview");
  if (!box) return;

  if (!currentAnswers.length) {
    box.classList.add("empty-state");
    box.textContent = "Your answer draft will appear here.";
    return;
  }

  box.classList.remove("empty-state");

  box.innerHTML = currentAnswers.map((answer, index) => `
    <div class="answer-block">
      <b>${index + 1}. ${safeText(answer.question)}</b>

      <div contenteditable="true" data-answer="${index}">
        ${safeText(answer.answer)}
      </div>
    </div>
  `).join("");

  box.querySelectorAll("[data-answer]").forEach(element => {
    element.addEventListener("input", () => {
      currentAnswers[Number(element.dataset.answer)].answer =
        element.innerText;
    });
  });
}

async function generateHomework() {
  if (!sb || !currentUser) {
    return toast("Please log in first.");
  }

  let questionText = $("questionText").value.trim();

  try {
    if (!questionText && selectedQuestionFile) {
      questionText = await extractPdfText(selectedQuestionFile);
    }
  } catch (error) {
    return setStatus(error.message, true);
  }

  if (!questionText) {
    return setStatus(
      "Upload a text-based PDF or paste the questions first.",
      true
    );
  }

  if (questionText.length > 18000) {
    return setStatus(
      "Please keep the extracted assignment text under 18,000 characters.",
      true
    );
  }

  if (!selectedTemplateFile) {
    return setStatus(
      "Upload a blank paper PDF or image template first.",
      true
    );
  }

  $("generateHomework").disabled = true;
  setStatus("Preparing your answer draft...");

  try {
    const templateData = await selectedTemplateFile.arrayBuffer();
    const templateType = selectedTemplateFile.type;

    const { data, error } = await sb.functions.invoke(
      "generate-homework",
      {
        body: {
          questions: questionText,
          detail: $("answerDetail").value
        }
      }
    );

    if (error) throw error;

    if (!data?.answers?.length) {
      throw new Error("The AI did not return any answers.");
    }

    currentAnswers = data.answers;
    currentWatermark = !!data.watermark;
    currentJobId = data.job_id;

    selectedTemplateFile._bytes = templateData;
    selectedTemplateFile._type = templateType;

    renderAnswers();

    $("exportHomework").disabled = false;

    setStatus(
      currentWatermark
        ? "Draft ready. Your second Free PDF today will include a StudentHub watermark."
        : "Draft ready. Review your answers, then export your PDF."
    );

    await refreshUsage();

  } catch (error) {
    console.error(error);

    setStatus(
      error.message ||
      "Could not generate answers. Check the Edge Function and AI secret setup.",
      true
    );

  } finally {
    $("generateHomework").disabled = false;
  }
}

if ($("generateHomework")) {
  $("generateHomework").onclick = generateHomework;
}


/* 14. HOMEWORK PDF EXPORT */

async function exportHomework() {
  if (
    !currentAnswers.length ||
    !selectedTemplateFile?._bytes
  ) {
    return;
  }

  if (!window.PDFLib) {
    throw new Error("PDF library did not load.");
  }

  const {
    PDFDocument,
    StandardFonts,
    rgb,
    degrees
  } = PDFLib;

  const bytes = selectedTemplateFile._bytes;
  const type = selectedTemplateFile._type;

  let templateDoc;

  if (type === "application/pdf") {
    templateDoc = await PDFDocument.load(bytes);
  } else {
    templateDoc = await PDFDocument.create();

    const page = templateDoc.addPage([595, 842]);

    let img;

    if (type === "image/png") {
      img = await templateDoc.embedPng(bytes);
    } else if (
      type === "image/jpeg" ||
      type === "image/jpg"
    ) {
      img = await templateDoc.embedJpg(bytes);
    } else {
      throw new Error("Please upload a PNG, JPG or PDF paper template.");
    }

    const scale = Math.min(
      page.getWidth() / img.width,
      page.getHeight() / img.height
    );

    page.drawImage(img, {
      x: (page.getWidth() - img.width * scale) / 2,
      y: (page.getHeight() - img.height * scale) / 2,
      width: img.width * scale,
      height: img.height * scale
    });
  }

  const output = await PDFDocument.create();

  const font = await output.embedFont(
    $("writingStyle")?.value === "italic"
      ? StandardFonts.TimesRomanItalic
      : StandardFonts.TimesRoman
  );

  const ink = $("inkColour")?.value === "blue"
    ? rgb(0.08, 0.18, 0.52)
    : rgb(0.08, 0.08, 0.08);

  const templatePages = templateDoc.getPages();

  for (let i = 0; i < currentAnswers.length; i++) {
    const sourceIndex = Math.min(
      i,
      templatePages.length - 1
    );

    const [page] = await output.copyPages(
      templateDoc,
      [sourceIndex]
    );

    output.addPage(page);

    const { width, height } = page.getSize();

    const margin = 62;
    let y = height - 95;

    const text =
      `${i + 1}. ${currentAnswers[i].question}\n` +
      `${currentAnswers[i].answer}`;

    const words = text.split(/\s+/);
    const lines = [];

    let line = "";

    for (const word of words) {
      const next = line ? line + " " + word : word;

      if (font.widthOfTextAtSize(next, 11) > width - margin * 2) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }

    if (line) lines.push(line);

    for (const textLine of lines) {
      if (y < 55) break;

      page.drawText(textLine, {
        x: margin,
        y,
        size: 11,
        font,
        color: ink
      });

      y -= 18;
    }

    if (currentWatermark) {
      page.drawText("STUDENTHUB", {
        x: width * 0.18,
        y: height * 0.43,
        size: 42,
        font: await output.embedFont(StandardFonts.HelveticaBold),
        color: rgb(0.82, 0.82, 0.82),
        opacity: 0.25,
        rotate: degrees(-32)
      });
    }

    page.drawText(
      "Prepared with StudentHub · Please review before submission",
      {
        x: margin,
        y: 28,
        size: 7,
        font: await output.embedFont(StandardFonts.Helvetica),
        color: rgb(0.55, 0.55, 0.55)
      }
    );
  }

  const pdfBytes = await output.save();

  const blob = new Blob(
    [pdfBytes],
    { type: "application/pdf" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "StudentHub-Homework-Draft.pdf";
  link.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);

  toast("PDF downloaded. Please review it before printing.");
}

if ($("exportHomework")) {
  $("exportHomework").onclick = () => {
    exportHomework().catch(error => {
      console.error(error);
      toast("PDF export failed: " + error.message);
    });
  };
}


/* 15. STARTUP */

async function boot() {
  setupAuth();
  setupNavigation();
  setupEducation();

  if (!configured || !sb) {
    showAuthScreen();
    toast("Setup needed: add your Supabase project details in config.js.");
    return;
  }

  try {
    const {
      data: { session },
      error
    } = await sb.auth.getSession();

    if (error) throw error;

    if (session?.user) {
      await enterApp(session.user);
    } else {
      showAuthScreen();
    }

    sb.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        showAuthScreen();
        showAuth("newPasswordForm");
      } else if (event === "SIGNED_OUT") {
        currentUser = null;
        currentProfile = null;
        showAuthScreen();
      }
    });

  } catch (error) {
    console.error("StudentHub startup error:", error);
    toast("Unable to start StudentHub: " + error.message);
  }
}

boot();
