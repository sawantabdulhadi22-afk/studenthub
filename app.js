/* =========================================================
   STUDENTHUB - COMPLETE FRONTEND
   Supabase + Dashboard + Resources + Admin + Planner
   Enhanced AI Homework Writer + OCR + Handwriting PDF
   ========================================================= */

/* 1. SUPABASE */

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
let homeworkFontBytes = null;

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
    "study-ai": "StudentHub AI",
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

  $("page-" + page)?.classList.add("active");

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
    button.addEventListener("click", () => navigate(button.dataset.page));
  });

  document.querySelectorAll("[data-go]").forEach(button => {
    button.addEventListener("click", () => navigate(button.dataset.go));
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

  if (!error) usageToday = data?.length || 0;

  if ($("pdfCount")) {
    $("pdfCount").textContent =
      currentProfile?.plan === "pro"
        ? `${usageToday} / 50`
        : `${usageToday} / 2`;
  }

  if ($("homeworkUsage")) {
    $("homeworkUsage").textContent =
      currentProfile?.plan === "pro"
        ? "Pro plan: higher fair-use generation limit."
        : "Free plan: 2 PDFs daily. Your second PDF may include a StudentHub watermark.";
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

      if (!sb) return toast("Configure Supabase in config.js first.");

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
    "Science - PCM", "Science - PCB", "Commerce", "Arts"
  ],
  "Class 12": [
    "Science - PCM", "Science - PCB", "Commerce", "Arts"
  ],
  "B.Tech": [
    "Computer Science",
    "Mechanical Engineering",
    "Civil Engineering",
    "Electrical Engineering",
    "Electronics & Communication"
  ],
  "ITI": [
    "Fitter", "Electrician", "Welder", "Turner", "Mechanic Motor Vehicle"
  ]
};

const boards = {
  "Diploma": [
    "MSBTE Maharashtra", "BTEUP Uttar Pradesh",
    "DTE Karnataka", "TNDOTE Tamil Nadu",
    "WBSCTE West Bengal", "Other Board"
  ],
  "Class 11": [
    "Maharashtra State Board", "CBSE", "ISC", "Other Board"
  ],
  "Class 12": [
    "Maharashtra State Board", "CBSE", "ISC", "Other Board"
  ],
  "B.Tech": [
    "University / Autonomous", "Mumbai University",
    "SPPU Pune", "Other University"
  ],
  "ITI": ["NCVT", "SCVT", "Other Board"]
};

const subjects = {
  "Mechanical Engineering": [
    "Engineering Mathematics", "Applied Physics", "Applied Chemistry",
    "Engineering Graphics", "Workshop Practice", "Strength of Materials",
    "Fluid Mechanics", "Manufacturing Technology",
    "Automobile Engineering", "Theory of Machines"
  ],
  "Civil Engineering": [
    "Engineering Mathematics", "Applied Physics", "Engineering Graphics",
    "Building Materials", "Surveying", "Strength of Materials",
    "Fluid Mechanics", "Concrete Technology"
  ],
  "Computer Engineering": [
    "Engineering Mathematics", "Applied Physics", "Programming in C",
    "Computer Fundamentals", "Data Structures", "Database Management",
    "Computer Networks", "Web Technology"
  ],
  "Electrical Engineering": [
    "Engineering Mathematics", "Applied Physics",
    "Basic Electrical Engineering", "Electrical Machines",
    "Power Systems", "Measurements", "Electronics"
  ],
  "Automobile Engineering": [
    "Engineering Mathematics", "Applied Physics", "Automobile Engines",
    "Vehicle Chassis", "Automotive Transmission",
    "Vehicle Maintenance", "Automobile Electrical Systems"
  ],
  "Science - PCM": [
    "Physics", "Chemistry", "Mathematics", "English", "Computer Science"
  ],
  "Science - PCB": [
    "Physics", "Chemistry", "Biology", "English", "Environmental Education"
  ],
  "Commerce": [
    "Accountancy", "Economics", "Business Studies", "Mathematics", "English"
  ],
  "Arts": [
    "History", "Geography", "Political Science",
    "Psychology", "Sociology", "English"
  ],
  "Computer Science": [
    "Engineering Mathematics", "Programming", "Data Structures",
    "Database Systems", "Operating Systems", "Computer Networks"
  ],
  "Electronics & Communication": [
    "Engineering Mathematics", "Electronic Devices",
    "Digital Electronics", "Communication Systems", "Microprocessors"
  ],
  "Fitter": [
    "Workshop Calculation", "Engineering Drawing", "Fitting", "Welding", "Safety"
  ],
  "Electrician": [
    "Electrical Fundamentals", "Wiring", "Electrical Machines",
    "Measurements", "Safety"
  ],
  "Welder": [
    "Welding Technology", "Engineering Drawing",
    "Workshop Calculation", "Safety"
  ],
  "Turner": [
    "Turning Operations", "Engineering Drawing",
    "Workshop Calculation", "Machine Tools"
  ],
  "Mechanic Motor Vehicle": [
    "Automobile Engines", "Vehicle Systems",
    "Workshop Practice", "Electrical Systems"
  ]
};

function fillSelect(id, items, placeholder) {
  const select = $(id);
  if (!select) return;

  select.innerHTML = "";
  select.add(new Option(placeholder, ""));

  (items || []).forEach(item => select.add(new Option(item, item)));
}

function updateEducation() {
  const course = $("course")?.value;

  fillSelect("board", boards[course], "Select board");
  fillSelect("branch", branches[course], "Select stream or branch");
  fillSelect("term", [], "Select semester or year");
  fillSelect("subject", [], "Select subject");

  if ($("resourceTitle")) $("resourceTitle").textContent = "Choose a subject first";
  if ($("resourceGrid")) $("resourceGrid").innerHTML = "";
  if ($("selectionMessage")) {
    $("selectionMessage").textContent = "Select your education details to continue.";
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
  fillSelect("subject", subjects[$("branch")?.value] || [], "Select subject");
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
    button.onclick = () => openResource(button.dataset.resource, subject);
  });

  grid.querySelectorAll("[data-save]").forEach(button => {
    button.onclick = () => saveResource(button.dataset.save, subject);
  });
}

async function sampleContent(type, subject) {
  const preview = $("previewBody");
  if (!preview || !sb) return;

  preview.textContent = `Loading ${type}...`;

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

    if (!data?.length) {
      preview.textContent =
        `No ${type} have been published for ${subject} yet.`;
      return;
    }

    preview.innerHTML = data.map(item => `
      <article class="resource-content">
        <h3>${safeText(item.title)}</h3>
        ${item.chapter ? `<p><b>Chapter:</b> ${safeText(item.chapter)}</p>` : ""}
        ${item.exam_year ? `<p><b>Exam year:</b> ${safeText(item.exam_year)}</p>` : ""}
        ${item.scheme ? `<p><b>Scheme:</b> ${safeText(item.scheme)}</p>` : ""}
        <div class="resource-answer">${safeText(item.content).replace(/\n/g, "<br>")}</div>
        ${item.source_label ? `<p class="muted">Source: ${safeText(item.source_label)}</p>` : ""}
      </article><hr>
    `).join("");

  } catch (error) {
    console.error(error);
    preview.textContent = "Unable to load resources. Please try again.";
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

  if (savedItems.some(x => x.title === item.title && x.subject === item.subject)) {
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
      <button class="small-btn" data-remove="${safeText(item.id)}">Remove</button>
    </article>
  `).join("");

  el.querySelectorAll("[data-remove]").forEach(button => {
    button.onclick = async () => {
      const { error } = await sb
        .from("saved_items")
        .delete()
        .eq("id", button.dataset.remove);

      if (error) return toast(error.message);

      savedItems = savedItems.filter(item => item.id !== button.dataset.remove);
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
    el.innerHTML = `<p class="muted tiny">No tasks yet. Add your first study task.</p>`;
    return;
  }

  el.innerHTML = tasks.map(task => `
    <div class="task-row ${task.is_done ? "done" : ""}">
      <input type="checkbox" data-task="${safeText(task.id)}" ${task.is_done ? "checked" : ""}>
      <span class="task-text">${safeText(task.title)}</span>
      <small>${task.due_date ? safeText(task.due_date) : ""}</small>
      <button class="small-btn" data-delete-task="${safeText(task.id)}">×</button>
    </div>
  `).join("");

  el.querySelectorAll("[data-task]").forEach(checkbox => {
    checkbox.onchange = async () => {
      const { error } = await sb
        .from("study_tasks")
        .update({ is_done: checkbox.checked })
        .eq("id", checkbox.dataset.task);

      if (error) return toast(error.message);

      const task = tasks.find(item => item.id === checkbox.dataset.task);
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

      tasks = tasks.filter(task => task.id !== button.dataset.deleteTask);
      renderTasks();
      refreshStats();
    };
  });
}

if ($("taskForm")) {
  $("taskForm").onsubmit = async event => {
    event.preventDefault();
    await addTask($("taskInput").value.trim(), $("taskDate").value);
    $("taskInput").value = "";
    $("taskDate").value = "";
  };
}


/* 11. PROFILE UPDATE */

if ($("saveProfile")) {
  $("saveProfile").onclick = async () => {
    if (!sb || !currentUser) return;

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
      <p class="muted">Add educational content, review it and publish it for students.</p>

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
        <textarea id="adminContent" rows="12" required placeholder="Enter detailed content here..."></textarea>

        <label>Source / Reference</label>
        <input id="adminSource" placeholder="e.g. Official paper or AI-generated practice">

        <label>Exam year (optional)</label>
        <input id="adminYear" type="number" min="1900" max="2100">

        <label>Scheme (optional)</label>
        <input id="adminScheme" placeholder="e.g. K Scheme">

        <label><input id="adminPublished" type="checkbox"> Publish this resource</label>

        <div class="resource-actions">
          <button type="submit" class="small-btn" id="adminSubmit">Save resource</button>
          <button type="button" class="small-btn" id="adminCancel">Clear form</button>
        </div>

        <p id="adminStatus" class="muted"></p>
      </form>
    </div>

    <div class="panel">
      <h2>Published and draft resources</h2>
      <div id="adminResourceList">Loading resources...</div>
    </div>
  `;

  $("adminResourceForm").onsubmit = saveAdminResource;
  $("adminCancel").onclick = clearAdminForm;
  loadAdminResources();
}

function clearAdminForm() {
  editingResourceId = null;
  $("adminResourceForm")?.reset();

  if ($("adminFormHeading")) $("adminFormHeading").textContent = "Add new resource";
  if ($("adminSubmit")) $("adminSubmit").textContent = "Save resource";
  if ($("adminStatus")) $("adminStatus").textContent = "";
}

async function saveAdminResource(event) {
  event.preventDefault();

  if (currentProfile?.role !== "admin") return toast("Admin access only.");

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

  if (!resource.course || !resource.subject || !resource.title || !resource.content) {
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
        .insert({ ...resource, created_by: currentUser.id });
    }

    if (result.error) throw result.error;

    toast(editingResourceId ? "Resource updated." : "Resource added.");
    clearAdminForm();
    await loadAdminResources();

  } catch (error) {
    console.error(error);
    $("adminStatus").textContent = error.message || "Could not save resource.";
    toast(error.message || "Could not save resource.");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = editingResourceId ? "Update resource" : "Save resource";
  }
}

async function loadAdminResources() {
  if (!sb || currentProfile?.role !== "admin") return;

  const list = $("adminResourceList");
  if (!list) return;

  list.textContent = "Loading resources...";

  const { data, error } = await sb
    .from("study_resources")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    list.textContent = "Unable to load resources: " + error.message;
    return;
  }

  if (!data?.length) {
    list.textContent = "No resources added yet.";
    return;
  }

  list.innerHTML = data.map(item => `
    <article class="resource-card">
      <h3>${safeText(item.title)}</h3>
      <p>${safeText(item.subject)} · ${safeText(item.resource_type)}</p>
      <p class="muted">${safeText(item.course)} · ${safeText(item.branch || "")} · ${safeText(item.term || "")}</p>
      <p>Status: <b>${item.is_published ? "Published" : "Draft"}</b></p>
      <div class="resource-actions">
        <button class="small-btn" data-edit-resource="${safeText(item.id)}">Edit</button>
        <button class="small-btn" data-toggle-resource="${safeText(item.id)}">${item.is_published ? "Unpublish" : "Publish"}</button>
        <button class="small-btn" data-delete-resource="${safeText(item.id)}">Delete</button>
      </div>
    </article>
  `).join("");

  list.querySelectorAll("[data-edit-resource]").forEach(button => {
    button.onclick = () => {
      const item = data.find(resource => resource.id === button.dataset.editResource);
      if (item) editAdminResource(item);
    };
  });

  list.querySelectorAll("[data-toggle-resource]").forEach(button => {
    button.onclick = async () => {
      const item = data.find(resource => resource.id === button.dataset.toggleResource);
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

  $("page-admin").scrollIntoView({ behavior: "smooth", block: "start" });
}


/* 13. HOMEWORK WRITER - ENHANCED INTERFACE */

function addHomeworkControls() {
  const page = $("page-homework");
  if (!page || $("homeworkExtraControls")) return;

  const container = document.createElement("section");
  container.id = "homeworkExtraControls";
  container.className = "panel";

  container.innerHTML = `
    <h3>Handwriting & Page Settings</h3>
    <p class="muted">Customize the appearance of your printable study draft.</p>

    <div class="homework-settings-grid">
      <div>
        <label for="hwFont">Handwriting style</label>
        <select id="hwFont">
          <option value="kalam">Kalam</option>
          <option value="caveat">Caveat</option>
          <option value="patrick">Patrick Hand</option>
          <option value="times">Classic text</option>
        </select>
      </div>

      <div>
        <label for="hwInk">Ink colour</label>
        <select id="hwInk">
          <option value="blue">Blue</option>
          <option value="black">Black</option>
          <option value="navy">Navy</option>
        </select>
      </div>

      <div>
        <label for="hwFontSize">Writing size</label>
        <input id="hwFontSize" type="range" min="9" max="20" value="13">
        <span id="hwFontSizeValue">13 pt</span>
      </div>

      <div>
        <label for="hwLineSpacing">Line spacing</label>
        <input id="hwLineSpacing" type="range" min="14" max="32" value="21">
        <span id="hwLineSpacingValue">21 pt</span>
      </div>

      <div>
        <label for="hwMargin">Side margins</label>
        <input id="hwMargin" type="range" min="35" max="110" value="62">
        <span id="hwMarginValue">62 pt</span>
      </div>

      <div>
        <label for="hwTopMargin">Top margin</label>
        <input id="hwTopMargin" type="range" min="40" max="150" value="90">
        <span id="hwTopMarginValue">90 pt</span>
      </div>
    </div>

    <p class="muted tiny">
      Handwriting fonts require an internet connection when the PDF is created.
      If a font cannot be loaded, StudentHub will use a readable fallback font.
    </p>
  `;

  const anchor = $("answerPreview")?.parentElement || page;
  anchor.insertBefore(container, $("answerPreview") || null);

  [
    ["hwFontSize", "hwFontSizeValue", " pt"],
    ["hwLineSpacing", "hwLineSpacingValue", " pt"],
    ["hwMargin", "hwMarginValue", " pt"],
    ["hwTopMargin", "hwTopMarginValue", " pt"]
  ].forEach(([inputId, outputId, suffix]) => {
    $(inputId)?.addEventListener("input", () => {
      $(outputId).textContent = $(inputId).value + suffix;
    });
  });
}


/* 14. PDF AND IMAGE TEXT READING */

async function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = [...document.scripts].find(script => script.src === src);

    if (existing) {
      if (existing.dataset.loaded === "yes") return resolve();
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.onload = () => {
      script.dataset.loaded = "yes";
      resolve();
    };
    script.onerror = () => reject(new Error("Could not load required library."));
    document.head.appendChild(script);
  });
}

async function ensurePdfJs() {
  if (!window.pdfjsLib) {
    await loadScript(
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
    );
  }

  if (!window.pdfjsLib) throw new Error("PDF reader did not load.");

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  return pdfjsLib;
}

async function ensureOcr() {
  if (!window.Tesseract) {
    await loadScript(
      "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"
    );
  }

  if (!window.Tesseract) throw new Error("OCR library did not load.");
  return window.Tesseract;
}

async function recognizeImage(file, onProgress = () => {}) {
  const Tesseract = await ensureOcr();

  const result = await Tesseract.recognize(
    file,
    "eng",
    {
      logger: message => {
        if (message.status === "recognizing text") {
          onProgress(Math.round((message.progress || 0) * 100));
        }
      }
    }
  );

  return result.data.text || "";
}

async function extractPdfText(file) {
  const pdfjs = await ensurePdfJs();
  const bytes = await file.arrayBuffer();

  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  let text = "";

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();

    const pageText = content.items
      .map(item => item.str)
      .join(" ")
      .trim();

    if (pageText.length > 15) {
      text += `\n\n--- Page ${pageNumber} ---\n${pageText}`;
      continue;
    }

    // Scanned page: render it and run OCR.
    setStatus(`Reading scanned page ${pageNumber} of ${pdf.numPages}...`);

    const viewport = page.getViewport({ scale: 1.7 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    await page.render({
      canvasContext: context,
      viewport
    }).promise;

    const Tesseract = await ensureOcr();

    const result = await Tesseract.recognize(
      canvas,
      "eng",
      {
        logger: message => {
          if (message.status === "recognizing text") {
            setStatus(
              `OCR page ${pageNumber}/${pdf.numPages}: ${Math.round((message.progress || 0) * 100)}%`
            );
          }
        }
      }
    );

    text += `\n\n--- Page ${pageNumber} (OCR) ---\n${result.data.text || ""}`;

    canvas.width = 1;
    canvas.height = 1;
  }

  return text.trim();
}

async function readQuestionFile(file) {
  if (!file) return "";

  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return extractPdfText(file);
  }

  if (file.type.startsWith("image/")) {
    setStatus("Reading uploaded image with OCR...");
    return recognizeImage(file, progress => {
      setStatus(`Reading image: ${progress}%`);
    });
  }

  throw new Error("Please upload a PDF, PNG or JPG file.");
}


/* 15. HOMEWORK FILE INPUTS */

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


/* 16. ANSWER PREVIEW */

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
      <b>${index + 1}. ${safeText(answer.question || "Question")}</b>
      <div
        contenteditable="true"
        data-answer="${index}"
        class="editable-answer"
        spellcheck="true"
      >${safeText(answer.answer || "")}</div>
    </div>
  `).join("");

  box.querySelectorAll("[data-answer]").forEach(element => {
    element.addEventListener("input", () => {
      currentAnswers[Number(element.dataset.answer)].answer =
        element.innerText;
    });
  });
}


/* 17. GENERATE HOMEWORK */

async function generateHomework() {
  if (!sb || !currentUser) {
    return toast("Please log in first.");
  }

  let questionText = $("questionText")?.value.trim() || "";

  try {
    if (!questionText && selectedQuestionFile) {
      setStatus("Reading your assignment...");

      questionText = await readQuestionFile(selectedQuestionFile);

      if ($("questionText")) {
        $("questionText").value = questionText;
      }
    }
  } catch (error) {
    console.error(error);
    return setStatus(error.message, true);
  }

  if (!questionText) {
    return setStatus(
      "Upload a PDF/image or paste your questions first.",
      true
    );
  }

  if (questionText.length > 18000) {
    return setStatus(
      "Please keep the assignment text under 18,000 characters.",
      true
    );
  }

  if (!selectedTemplateFile) {
    return setStatus(
      "Upload a blank paper PDF or image template first.",
      true
    );
  }

  const generateButton = $("generateHomework");
  if (generateButton) {
    generateButton.disabled = true;
    generateButton.textContent = "Generating...";
  }

  setStatus("Preparing your answer draft...");

  try {
    const { data, error } = await sb.functions.invoke(
      "generate-homework",
      {
        body: {
          questions: questionText,
          detail: $("answerDetail")?.value || "Detailed student-friendly answers"
        }
      }
    );

    if (error) throw error;

    if (!data?.answers?.length) {
      throw new Error("The AI did not return any answers.");
    }

    currentAnswers = data.answers.map(answer => ({
      question: String(answer.question || ""),
      answer: String(answer.answer || "")
    }));

    currentWatermark = !!data.watermark;
    currentJobId = data.job_id || null;

    renderAnswers();

    if ($("exportHomework")) $("exportHomework").disabled = false;

    setStatus(
      "Draft ready. Edit and review the answers before exporting your PDF."
    );

    await refreshUsage();

  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not generate answers.", true);
  } finally {
    if (generateButton) {
      generateButton.disabled = false;
      generateButton.textContent = "Generate answers";
    }
  }
}

if ($("generateHomework")) {
  $("generateHomework").onclick = generateHomework;
}


/* 18. HANDWRITING FONT SUPPORT */

const handwritingFontUrls = {
  kalam: "https://raw.githubusercontent.com/google/fonts/main/ofl/kalam/Kalam-Regular.ttf",
  caveat: "https://raw.githubusercontent.com/google/fonts/main/ofl/caveat/Caveat%5Bwght%5D.ttf",
  patrick: "https://raw.githubusercontent.com/google/fonts/main/ofl/patrickhand/PatrickHand-Regular.ttf"
};

async function loadHandwritingFont(style) {
  if (style === "times") return null;

  try {
    await loadScript(
      "https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js"
    );

    if (!window.fontkit) {
      throw new Error("Font embedding library did not load.");
    }

    const response = await fetch(handwritingFontUrls[style]);

    if (!response.ok) throw new Error("Font download failed.");

    return await response.arrayBuffer();

  } catch (error) {
    console.warn("Handwriting font unavailable:", error);
    toast("Handwriting font unavailable. Using a standard font instead.");
    return null;
  }
}


/* 19. PDF EXPORT HELPERS */

function splitTextIntoLines(text, font, size, maxWidth) {
  const lines = [];

  const paragraphs = String(text || "").replace(/\r/g, "").split("\n");

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }

    const words = paragraph.split(/\s+/);
    let line = "";

    for (const word of words) {
      const candidate = line ? line + " " + word : word;

      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) lines.push(line);

        // Split a single very long word if needed.
        if (font.widthOfTextAtSize(word, size) > maxWidth) {
          let part = "";

          for (const character of word) {
            const test = part + character;

            if (font.widthOfTextAtSize(test, size) > maxWidth && part) {
              lines.push(part);
              part = character;
            } else {
              part = test;
            }
          }

          line = part;
        } else {
          line = word;
        }
      }
    }

    if (line) lines.push(line);
  }

  return lines;
}

async function loadPaperTemplate() {
  const { PDFDocument } = PDFLib;
  const bytes = await selectedTemplateFile.arrayBuffer();
  const type = selectedTemplateFile.type;

  if (type === "application/pdf" || selectedTemplateFile.name.toLowerCase().endsWith(".pdf")) {
    return PDFDocument.load(bytes);
  }

  const template = await PDFDocument.create();
  const page = template.addPage([595, 842]);

  let image;

  if (type === "image/png") {
    image = await template.embedPng(bytes);
  } else if (type === "image/jpeg" || type === "image/jpg") {
    image = await template.embedJpg(bytes);
  } else {
    throw new Error("Paper template must be a PDF, PNG or JPG.");
  }

  const scale = Math.min(
    page.getWidth() / image.width,
    page.getHeight() / image.height
  );

  const width = image.width * scale;
  const height = image.height * scale;

  page.drawImage(image, {
    x: (page.getWidth() - width) / 2,
    y: (page.getHeight() - height) / 2,
    width,
    height
  });

  return template;
}

function getInkColour(rgb) {
  const selected = $("hwInk")?.value || $("inkColour")?.value || "blue";

  if (selected === "black") return rgb(0.08, 0.08, 0.08);
  if (selected === "navy") return rgb(0.04, 0.12, 0.35);

  return rgb(0.08, 0.18, 0.52);
}


/* 20. MULTI-PAGE HOMEWORK PDF EXPORT */

async function exportHomework() {
  if (!currentAnswers.length || !selectedTemplateFile) {
    return toast("Generate your answers and upload a paper template first.");
  }

  if (!window.PDFLib) {
    throw new Error("PDF library did not load. Check index.html.");
  }

  const {
    PDFDocument,
    StandardFonts,
    rgb,
    degrees
  } = PDFLib;

  const templateDoc = await loadPaperTemplate();
  const output = await PDFDocument.create();

  const style = $("hwFont")?.value || "kalam";
  const fontBytes = await loadHandwritingFont(style);

  let font;

  if (fontBytes && window.fontkit) {
    output.registerFontkit(window.fontkit);
    font = await output.embedFont(fontBytes);
  } else {
    const oldStyle = $("writingStyle")?.value;

    font = await output.embedFont(
      oldStyle === "italic"
        ? StandardFonts.TimesRomanItalic
        : StandardFonts.TimesRoman
    );
  }

  const regularFont = await output.embedFont(StandardFonts.Helvetica);
  const boldFont = await output.embedFont(StandardFonts.HelveticaBold);

  const ink = getInkColour(rgb);

  const fontSize = Number($("hwFontSize")?.value || 13);
  const lineSpacing = Number($("hwLineSpacing")?.value || 21);
  const margin = Number($("hwMargin")?.value || 62);
  const topMargin = Number($("hwTopMargin")?.value || 90);

  const templatePages = templateDoc.getPages();

  if (!templatePages.length) {
    throw new Error("Your paper template has no pages.");
  }

  const sourcePages = [];

  // Repeat template pages in order when the answer needs more pages.
  function addNewPage(pageNumber) {
    const sourceIndex = (pageNumber - 1) % templatePages.length;
    sourcePages.push(sourceIndex);
  }

  addNewPage(1);

  let pageNumber = 1;
  let page;
  let pageWidth;
  let pageHeight;
  let y;

  async function createOutputPage() {
    const sourceIndex = sourcePages[pageNumber - 1];

    const [copiedPage] = await output.copyPages(
      templateDoc,
      [sourceIndex]
    );

    output.addPage(copiedPage);

    page = copiedPage;
    const size = page.getSize();

    pageWidth = size.width;
    pageHeight = size.height;
    y = pageHeight - topMargin;
  }

  await createOutputPage();

  async function nextPage() {
    pageNumber++;
    addNewPage(pageNumber);
    await createOutputPage();
  }

  function drawWatermark() {
    if (!currentWatermark) return;

    page.drawText("STUDENTHUB", {
      x: pageWidth * 0.18,
      y: pageHeight * 0.45,
      size: 40,
      font: boldFont,
      color: rgb(0.82, 0.82, 0.82),
      opacity: 0.22,
      rotate: degrees(-32)
    });
  }

  function drawFooter() {
    page.drawText(
      `StudentHub study draft · Page ${pageNumber}`,
      {
        x: margin,
        y: 22,
        size: 7,
        font: regularFont,
        color: rgb(0.48, 0.48, 0.48)
      }
    );
  }

  for (let index = 0; index < currentAnswers.length; index++) {
    const item = currentAnswers[index];

    const question = `${index + 1}. ${item.question || "Question"}`;
    const answer = item.answer || "";

    const questionLines = splitTextIntoLines(
      question,
      boldFont,
      fontSize,
      pageWidth - margin * 2
    );

    const answerLines = splitTextIntoLines(
      answer,
      font,
      fontSize,
      pageWidth - margin * 2
    );

    const allLines = [
      ...questionLines,
      "",
      ...answerLines,
      ""
    ];

    for (const line of allLines) {
      if (y < 48) {
        drawWatermark();
        drawFooter();
        await nextPage();
      }

      if (line) {
        page.drawText(line, {
          x: margin,
          y,
          size: fontSize,
          font: line === questionLines[0] ? boldFont : font,
          color: ink
        });
      }

      y -= lineSpacing;
    }
  }

  drawWatermark();
  drawFooter();

  const pdfBytes = await output.save();

  const blob = new Blob(
    [pdfBytes],
    { type: "application/pdf" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "StudentHub-Homework-Draft.pdf";
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1500);

  toast("Your multi-page PDF is ready. Review it before printing.");
}

if ($("exportHomework")) {
  $("exportHomework").onclick = () => {
    exportHomework().catch(error => {
      console.error("Export error:", error);
      toast("PDF export failed: " + error.message);
    });
  };
}


/* 21. STUDENTHUB AI */

async function askStudyAI() {
  if (!sb || !currentUser) return toast("Please log in first.");

  const question = $("aiQuestion")?.value.trim();
  if (!question) return toast("Enter your question first.");

  const button = $("askStudyAI");
  const answerBox = $("aiAnswer");

  if (button) button.disabled = true;
  if ($("aiStatus")) $("aiStatus").textContent = "Thinking...";
  if ($("aiAnswerBox")) $("aiAnswerBox").classList.remove("hidden");
  if (answerBox) answerBox.textContent = "";

  try {
    const { data, error } = await sb.functions.invoke("ask-study-ai", {
      body: {
        question,
        course: $("aiCourse")?.value || "",
        subject: $("aiSubject")?.value || "",
        answerStyle: $("aiAnswerStyle")?.value || "Detailed",
        level: $("aiLevel")?.value || "Student"
      }
    });

    if (error) throw error;

    const answer =
      data?.answer ||
      data?.response ||
      data?.content ||
      "";

    if (!answer) throw new Error("The AI returned an empty answer.");

    if (answerBox) answerBox.textContent = answer;
    if ($("aiStatus")) $("aiStatus").textContent = "Answer ready.";

  } catch (error) {
    console.error(error);
    if ($("aiStatus")) $("aiStatus").textContent = error.message || "AI request failed.";
  } finally {
    if (button) button.disabled = false;
  }
}

if ($("askStudyAI")) {
  $("askStudyAI").onclick = askStudyAI;
}

if ($("copyAIAnswer")) {
  $("copyAIAnswer").onclick = async () => {
    const answer = $("aiAnswer")?.textContent || "";
    if (!answer) return toast("There is no answer to copy.");

    try {
      await navigator.clipboard.writeText(answer);
      toast("Answer copied.");
    } catch {
      toast("Could not copy the answer.");
    }
  };
}


/* 22. STARTUP */

async function boot() {
  setupAuth();
  setupNavigation();
  setupEducation();
  addHomeworkControls();

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

/* =========================================================
   23. ADMIN PYQ MANAGER
   Create papers, questions and exam-format solutions
   ========================================================= */

let selectedPYQPaperId = null;

function renderAdminPYQManager() {
  const page = $("page-admin");

  if (!page || currentProfile?.role !== "admin") return;

  let panel = $("adminPYQManager");

  if (!panel) {
    panel = document.createElement("section");
    panel.id = "adminPYQManager";
    panel.className = "panel";
    page.appendChild(panel);
  }

  panel.innerHTML = `
    <div style="margin-bottom:24px">
      <h2>PYQ & Examination Manager</h2>
      <p class="muted">
        Create previous-year papers and practice examinations
        for all branches and semesters.
      </p>
    </div>

    <div class="panel">
      <h3>Create New Paper</h3>

      <form id="pyqPaperForm">

        <label>Course</label>
        <input id="pyqCourse" value="MSBTE Diploma" required>

        <label>Board</label>
        <input id="pyqBoard" value="MSBTE" required>

        <label>Scheme</label>
        <input id="pyqScheme" value="K Scheme">

        <label>Branch</label>
        <input
          id="pyqBranch"
          list="pyqBranchOptions"
          placeholder="Select or type branch"
          required
        >

        <datalist id="pyqBranchOptions">
          <option value="Mechanical Engineering">
          <option value="Civil Engineering">
          <option value="Computer Engineering">
          <option value="Information Technology">
          <option value="Electrical Engineering">
          <option value="Automobile Engineering">
          <option value="Electronics Engineering">
          <option value="Food Technology">
          <option value="Chemical Engineering">
          <option value="Production Engineering">
          <option value="Instrumentation Engineering">
          <option value="All Branches">
        </datalist>

        <label>Semester</label>
        <select id="pyqTerm" required>
          <option value="">Select semester</option>
          ${[1,2,3,4,5,6].map(n =>
            `<option value="Semester ${n}">Semester ${n}</option>`
          ).join("")}
        </select>

        <label>Subject name with subject code</label>
        <input
          id="pyqSubject"
          placeholder="e.g. Manufacturing Technology (312313)"
          required
        >

        <label>Paper type</label>
        <select id="pyqType" required>
          <option value="PYQ">Previous Year Question Paper</option>
          <option value="Practice">Practice Paper</option>
        </select>

        <label>Paper format</label>
        <select id="pyqFormat" required>
          <option value="">Select marks</option>
          <option value="20">20 Marks - Short Test</option>
          <option value="30">30 Marks - Unit Test</option>
          <option value="70">70 Marks - Final Exam</option>
        </select>

        <label>Paper title</label>
        <input
          id="pyqTitle"
          placeholder="e.g. Manufacturing Technology Final Paper 1"
          required
        >

        <label>Exam year (PYQ only)</label>
        <input id="pyqYear" type="number" min="2000" max="2100">

        <label>Duration in minutes</label>
        <input id="pyqDuration" type="number" min="1" value="60" required>

        <label>Instructions</label>
        <textarea
          id="pyqInstructions"
          rows="4"
          placeholder="Enter examination instructions..."
        ></textarea>

        <button type="submit" class="small-btn" id="pyqCreateButton">
          Create Paper
        </button>

        <p id="pyqPaperStatus" class="muted"></p>
      </form>
    </div>

    <div class="panel" style="margin-top:20px">
      <h3>Add Questions and Solutions</h3>

      <label>Select paper</label>
      <select id="pyqQuestionPaper">
        <option value="">Select a paper first</option>
      </select>

      <div id="pyqQuestionArea" class="hidden">

        <p id="pyqSelectedPaperInfo" class="muted"></p>

        <form id="pyqQuestionForm">

          <label>Question number</label>
          <input id="pyqQuestionNumber" type="number" min="1" required>

          <label>Section (optional)</label>
          <input id="pyqSection" placeholder="e.g. Section A">

          <label>Question type</label>
          <select id="pyqQuestionType" required>
            <option value="short">Short answer</option>
            <option value="long">Long answer</option>
            <option value="mcq">MCQ</option>
            <option value="numerical">Numerical</option>
            <option value="diagram">Diagram-based</option>
          </select>

          <label>Question</label>
          <textarea
            id="pyqQuestionText"
            rows="4"
            placeholder="Write the complete question..."
            required
          ></textarea>

          <label>Marks</label>
          <input
            id="pyqQuestionMarks"
            type="number"
            min="0.5"
            step="0.5"
            required
          >

          <div id="pyqMCQFields" class="hidden">
            <label>MCQ options (one per line)</label>
            <textarea
              id="pyqOptions"
              rows="5"
              placeholder="A. Option one&#10;B. Option two&#10;C. Option three&#10;D. Option four"
            ></textarea>

            <label>Correct option</label>
            <input id="pyqCorrectOption" placeholder="e.g. B">
          </div>

          <label>Complete exam-format answer / solution</label>
          <textarea
            id="pyqSolution"
            rows="10"
            placeholder="Write the proper answer, explanation, steps, formulas and conclusion..."
            required
          ></textarea>

          <label>Marking scheme (optional)</label>
          <textarea
            id="pyqMarkingScheme"
            rows="4"
            placeholder="Example: Formula - 1 mark; calculation - 2 marks; answer with unit - 1 mark."
          ></textarea>

          <button type="submit" class="small-btn" id="pyqAddQuestionButton">
            Save Question and Answer
          </button>

          <p id="pyqQuestionStatus" class="muted"></p>
        </form>

        <div id="pyqQuestionList" style="margin-top:20px"></div>
      </div>
    </div>

    <div class="panel" style="margin-top:20px">
      <h3>Created Papers</h3>
      <div id="pyqPaperList">Loading papers...</div>
    </div>
  `;

  $("pyqPaperForm").onsubmit = createPYQPaper;
  $("pyqQuestionForm").onsubmit = addPYQQuestion;

  $("pyqQuestionPaper").onchange = async () => {
    selectedPYQPaperId = $("pyqQuestionPaper").value || null;

    $("pyqQuestionArea").classList.toggle(
      "hidden",
      !selectedPYQPaperId
    );

    if (selectedPYQPaperId) {
      await loadPYQQuestions();
    }
  };

  $("pyqQuestionType").onchange = () => {
    $("pyqMCQFields").classList.toggle(
      "hidden",
      $("pyqQuestionType").value !== "mcq"
    );
  };

  loadAdminPapers();
}


/* CREATE PAPER */

async function createPYQPaper(event) {
  event.preventDefault();

  if (currentProfile?.role !== "admin") {
    return toast("Admin access only.");
  }

  const format = Number($("pyqFormat").value);
  const year = $("pyqYear").value;

  if (![20, 30, 70].includes(format)) {
    return toast("Select a valid paper format.");
  }

  const paper = {
    course: $("pyqCourse").value.trim(),
    board: $("pyqBoard").value.trim(),
    scheme: $("pyqScheme").value.trim() || null,
    branch: $("pyqBranch").value.trim(),
    term: $("pyqTerm").value,
    subject: $("pyqSubject").value.trim(),
    paper_type: $("pyqType").value,
    paper_format: format,
    title: $("pyqTitle").value.trim(),
    exam_year: year ? Number(year) : null,
    duration_minutes: Number($("pyqDuration").value),
    max_marks: format,
    instructions: $("pyqInstructions").value.trim() || null,
    is_published: false,
    created_by: currentUser.id
  };

  if (
    !paper.course ||
    !paper.branch ||
    !paper.subject ||
    !paper.title ||
    !paper.duration_minutes
  ) {
    return toast("Complete all required paper details.");
  }

  if (paper.paper_type === "PYQ" && !paper.exam_year) {
    return toast("Enter the examination year for a PYQ.");
  }

  const button = $("pyqCreateButton");
  button.disabled = true;
  button.textContent = "Creating...";

  try {
    const { data, error } = await sb
      .from("exam_papers")
      .insert(paper)
      .select()
      .single();

    if (error) throw error;

    toast("Paper created successfully.");

    $("pyqPaperForm").reset();
    $("pyqCourse").value = "MSBTE Diploma";
    $("pyqBoard").value = "MSBTE";
    $("pyqScheme").value = "K Scheme";
    $("pyqDuration").value = 60;

    await loadAdminPapers();

    if (data?.id) {
      $("pyqQuestionPaper").value = data.id;
      selectedPYQPaperId = data.id;
      $("pyqQuestionArea").classList.remove("hidden");
      await loadPYQQuestions();
    }

  } catch (error) {
    console.error(error);
    $("pyqPaperStatus").textContent = error.message;
    toast("Could not create paper: " + error.message);

  } finally {
    button.disabled = false;
    button.textContent = "Create Paper";
  }
}


/* LOAD ADMIN PAPERS */

async function loadAdminPapers() {
  if (!sb || currentProfile?.role !== "admin") return;

  const list = $("pyqPaperList");
  const selector = $("pyqQuestionPaper");

  if (!list || !selector) return;

  list.textContent = "Loading papers...";

  const { data, error } = await sb
    .from("exam_papers")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    list.textContent = "Unable to load papers: " + error.message;
    return;
  }

  if (!data?.length) {
    list.innerHTML = `<p class="muted">No examination papers created yet.</p>`;
    selector.innerHTML = `<option value="">No papers available</option>`;
    return;
  }

  const previousSelection = selectedPYQPaperId;

  selector.innerHTML = `
    <option value="">Select a paper</option>
    ${data.map(paper => `
      <option value="${safeText(paper.id)}">
        ${safeText(paper.title)} · ${safeText(paper.branch)}
        · ${safeText(paper.term)}
      </option>
    `).join("")}
  `;

  if (previousSelection && data.some(p => p.id === previousSelection)) {
    selector.value = previousSelection;
  }

  list.innerHTML = data.map(paper => `
    <article class="resource-card" style="margin-bottom:12px">
      <h3>${safeText(paper.title)}</h3>

      <p>
        ${safeText(paper.branch)} ·
        ${safeText(paper.term)} ·
        ${safeText(paper.subject)}
      </p>

      <p class="muted">
        ${safeText(paper.paper_type)} ·
        ${paper.paper_format} marks ·
        ${paper.duration_minutes} minutes
        ${paper.exam_year ? " · " + paper.exam_year : ""}
      </p>

      <p>
        Status:
        <b>${paper.is_published ? "Published" : "Draft"}</b>
      </p>

      <div class="resource-actions">
        <button
          class="small-btn"
          data-manage-pyq="${safeText(paper.id)}"
        >Add Questions</button>

        <button
          class="small-btn"
          data-publish-pyq="${safeText(paper.id)}"
        >${paper.is_published ? "Unpublish" : "Publish"}</button>

        <button
          class="small-btn"
          data-delete-pyq="${safeText(paper.id)}"
        >Delete</button>
      </div>
    </article>
  `).join("");

  list.querySelectorAll("[data-manage-pyq]").forEach(button => {
    button.onclick = async () => {
      selectedPYQPaperId = button.dataset.managePyq;
      selector.value = selectedPYQPaperId;
      $("pyqQuestionArea").classList.remove("hidden");

      await loadPYQQuestions();

      $("pyqQuestionArea").scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    };
  });

  list.querySelectorAll("[data-publish-pyq]").forEach(button => {
    button.onclick = async () => {
      await togglePYQPublication(button.dataset.publishPyq, data);
    };
  });

  list.querySelectorAll("[data-delete-pyq]").forEach(button => {
    button.onclick = async () => {
      const paper = data.find(p => p.id === button.dataset.deletePyq);

      if (!paper) return;

      if (!confirm(
        "Delete this paper and all its questions and solutions permanently?"
      )) return;

      const { error } = await sb
        .from("exam_papers")
        .delete()
        .eq("id", paper.id);

      if (error) return toast(error.message);

      if (selectedPYQPaperId === paper.id) {
        selectedPYQPaperId = null;
      }

      toast("Paper deleted.");
      await loadAdminPapers();
    };
  });
}


/* PUBLISH / UNPUBLISH PAPER */

async function togglePYQPublication(paperId, papers) {
  const paper = papers.find(p => p.id === paperId);
  if (!paper) return;

  if (!paper.is_published) {
    const { data: questions, error: questionError } = await sb
      .from("exam_questions")
      .select("id,marks")
      .eq("paper_id", paperId);

    if (questionError) return toast(questionError.message);

    if (!questions?.length) {
      return toast("Add questions before publishing.");
    }

    const total = questions.reduce(
      (sum, question) => sum + Number(question.marks || 0),
      0
    );

    if (Math.abs(total - Number(paper.max_marks)) > 0.001) {
      return toast(
        `Question marks total ${total}, but this paper requires ${paper.max_marks}.`
      );
    }

    const { data: solutions, error: solutionError } = await sb
      .from("exam_solutions")
      .select("question_id")
      .in("question_id", questions.map(q => q.id));

    if (solutionError) return toast(solutionError.message);

    if (solutions?.length !== questions.length) {
      return toast("Add a solution for every question before publishing.");
    }
  }

  const { error } = await sb
    .from("exam_papers")
    .update({ is_published: !paper.is_published })
    .eq("id", paperId);

  if (error) return toast(error.message);

  toast(paper.is_published ? "Paper unpublished." : "Paper published.");
  await loadAdminPapers();
}


/* ADD QUESTION AND SOLUTION */

async function addPYQQuestion(event) {
  event.preventDefault();

  if (currentProfile?.role !== "admin") {
    return toast("Admin access only.");
  }

  if (!selectedPYQPaperId) {
    return toast("Select a paper first.");
  }

  const paperButton = $("pyqQuestionPaper");
  const selectedPaper = paperButton.selectedOptions[0]?.textContent || "";

  const questionNumber = Number($("pyqQuestionNumber").value);
  const marks = Number($("pyqQuestionMarks").value);
  const questionType = $("pyqQuestionType").value;
  const questionText = $("pyqQuestionText").value.trim();
  const solutionText = $("pyqSolution").value.trim();

  if (
    !Number.isInteger(questionNumber) ||
    questionNumber < 1 ||
    !Number.isFinite(marks) ||
    marks <= 0 ||
    !questionText ||
    !solutionText
  ) {
    return toast("Enter a valid question, marks and complete solution.");
  }

  let options = null;
  let correctOption = null;

  if (questionType === "mcq") {
    options = $("pyqOptions").value
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean);

    correctOption = $("pyqCorrectOption").value.trim();

    if (options.length < 2 || !correctOption) {
      return toast("Enter MCQ options and the correct option.");
    }
  }

  const button = $("pyqAddQuestionButton");
  button.disabled = true;
  button.textContent = "Saving...";

  try {
    const { data: question, error: questionError } = await sb
      .from("exam_questions")
      .insert({
        paper_id: selectedPYQPaperId,
        question_number: questionNumber,
        section: $("pyqSection").value.trim() || null,
        question_text: questionText,
        question_type: questionType,
        marks,
        options
      })
      .select()
      .single();

    if (questionError) throw questionError;

    const markingText = $("pyqMarkingScheme").value.trim();

    const { error: solutionError } = await sb
      .from("exam_solutions")
      .insert({
        question_id: question.id,
        solution_text: solutionText,
        correct_option: correctOption,
        marking_scheme: markingText
          ? { instructions: markingText }
          : null
      });

    if (solutionError) {
      console.error(solutionError);
      toast(
        "Question saved, but solution failed. Check the solution table before retrying."
      );
      return;
    }

    toast("Question and solution saved.");

    $("pyqQuestionForm").reset();
    $("pyqMCQFields").classList.add("hidden");

    await loadPYQQuestions();

  } catch (error) {
    console.error(error);
    $("pyqQuestionStatus").textContent = error.message;
    toast("Could not save question: " + error.message);

  } finally {
    button.disabled = false;
    button.textContent = "Save Question and Answer";
  }
}


/* VIEW QUESTIONS IN ADMIN */

async function loadPYQQuestions() {
  if (!selectedPYQPaperId) return;

  const list = $("pyqQuestionList");
  if (!list) return;

  list.textContent = "Loading questions...";

  const { data: paper, error: paperError } = await sb
    .from("exam_papers")
    .select("title,max_marks,paper_format")
    .eq("id", selectedPYQPaperId)
    .single();

  if (paperError) {
    list.textContent = paperError.message;
    return;
  }

  $("pyqSelectedPaperInfo").textContent =
    `${paper.title} · ${paper.max_marks} marks`;

  const { data, error } = await sb
    .from("exam_questions")
    .select("id,question_number,question_text,question_type,marks,section")
    .eq("paper_id", selectedPYQPaperId)
    .order("question_number", { ascending: true });

  if (error) {
    list.textContent = error.message;
    return;
  }

  if (!data?.length) {
    list.innerHTML = `<p class="muted">No questions added yet.</p>`;
    return;
  }

  const total = data.reduce(
    (sum, question) => sum + Number(question.marks),
    0
  );

  list.innerHTML = `
    <h3>Questions added: ${data.length}</h3>
    <p class="muted">
      Marks added: ${total} / ${paper.max_marks}
    </p>

    ${data.map(question => `
      <article class="resource-card" style="margin-bottom:10px">
        <b>Q${question.question_number} · ${question.marks} marks</b>
        <p>${safeText(question.question_text)}</p>
        <p class="muted">
          ${safeText(question.question_type)}
          ${question.section ? " · " + safeText(question.section) : ""}
        </p>
        <button
          class="small-btn"
          data-delete-pyq-question="${safeText(question.id)}"
        >Delete question</button>
      </article>
    `).join("")}
  `;

  list.querySelectorAll("[data-delete-pyq-question]").forEach(button => {
    button.onclick = async () => {
      if (!confirm("Delete this question and its solution?")) return;

      const { error } = await sb
        .from("exam_questions")
        .delete()
        .eq("id", button.dataset.deletePyqQuestion);

      if (error) return toast(error.message);

      toast("Question deleted.");
      await loadPYQQuestions();
    };
  });
}


/* 24. INITIALIZE PYQ MANAGER */

/* Add this function call inside navigate(page), after:
   if (page === "admin") loadAdminResources();
*/

function openAdminPYQManager() {
  if (currentProfile?.role !== "admin") {
    return toast("Admin access only.");
  }

  renderAdminPYQManager();
}
