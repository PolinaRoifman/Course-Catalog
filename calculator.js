const supabaseUrl = "https://qrhhucurihbrhnerycgo.supabase.co";
const supabaseKey = "sb_publishable_mhkLtsXDvK3MZd6s2wdnHQ_t-xQLLih";
const db = supabase.createClient(supabaseUrl, supabaseKey);

let courses = [];
let selectedYear = null;
let englishStartLevel = null;
let passedCourseIds = new Set();

const yearSelect = document.getElementById("yearSelect");
const englishStartSelect = document.getElementById("englishStartSelect");
const wizardEl = document.getElementById("wizard");
const promptMessageEl = document.getElementById("promptMessage");
const resultsAreaEl = document.getElementById("resultsArea");

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

// A course is "available to you" if the earliest year it's offered to is
// already at or before your current year — e.g. a 3rd-year student may
// have already had the chance to take a course meant for years 1-3.
// Courses with no year data at all are treated as available (missing
// data shouldn't silently hide something you might actually need).
function isAvailableToYear(course, year) {
  const years = toArray(course.years).map(Number).filter(n => !isNaN(n));
  if (years.length === 0) return true;
  return Math.min(...years) <= Number(year);
}

// English course levels aren't stored explicitly — inferred from the
// title, per keyword. Courses that don't match any keyword are left
// unclassified and excluded from the level checklist.
function inferEnglishLevel(title) {
  const t = (title || "").toLowerCase();
  if (t.includes("beginner")) return 100;
  if (t.includes("intermediate")) return 200;
  if (t.includes("advanced")) return 300;
  return null;
}

async function loadCourses() {
  const { data, error } = await db.from("courses").select("*");
  if (error) {
    console.error("Error loading courses:", error);
    promptMessageEl.textContent = "Couldn't load courses. Check the console.";
    return;
  }
  courses = data;
}

function creditsOf(course) {
  return course.credits || 6;
}

function sumPassedCredits(courseList) {
  return courseList
    .filter(c => passedCourseIds.has(c.id))
    .reduce((sum, c) => sum + creditsOf(c), 0);
}

function renderChecklist(containerEl, courseList, emptyLabel) {
  containerEl.innerHTML = "";

  if (courseList.length === 0) {
    containerEl.innerHTML = `<p class="no-sections">${emptyLabel}</p>`;
    return;
  }

  courseList.forEach(course => {
    const row = document.createElement("div");
    row.className = "check-row";

    const label = document.createElement("span");
    label.className = "check-title";
    label.textContent = `${course.title} (${creditsOf(course)} cr)`;
    row.appendChild(label);

    const passed = passedCourseIds.has(course.id);
    const btn = document.createElement("button");
    btn.className = "check-toggle" + (passed ? " active" : "");
    btn.textContent = passed ? "Passed ✓" : "Mark passed";
    btn.addEventListener("click", () => {
      if (passed) passedCourseIds.delete(course.id);
      else passedCourseIds.add(course.id);
      renderWizard();
    });

    row.appendChild(btn);
    containerEl.appendChild(row);
  });
}

function renderWizard() {
  if (!selectedYear || !englishStartLevel) {
    wizardEl.style.display = "none";
    promptMessageEl.style.display = "block";
    return;
  }
  wizardEl.style.display = "block";
  promptMessageEl.style.display = "none";

  const available = c => isAvailableToYear(c, selectedYear);

  // ---- English: only levels at/above the student's starting level ----
  const englishCourses = courses
    .filter(c => c.subject === "english")
    .map(c => ({ ...c, _level: inferEnglishLevel(c.title) }))
    .filter(c => c._level !== null && c._level >= Number(englishStartLevel))
    .filter(available)
    .sort((a, b) => a._level - b._level || a.title.localeCompare(b.title, ["ru", "en"]));

  renderChecklist(document.getElementById("englishList"), englishCourses, "No matching English courses available to you yet.");

  const requiredTiers = [100, 200, 300].filter(t => t >= Number(englishStartLevel));
  const tierProgress = requiredTiers.map(tier => {
    const tierCourses = englishCourses.filter(c => c._level === tier);
    const sum = sumPassedCredits(tierCourses);
    return { tier, sum, need: Math.max(0, 12 - sum) };
  });
  document.getElementById("englishProgress").textContent = tierProgress
    .map(t => `English ${t.tier}: ${t.sum}/12 credits`)
    .join("   ·   ");

  // ---- Economics: non-mandatory only, at least 42 credits ----
  const economicsCourses = courses
    .filter(c => c.subject === "economics" && !c.is_mandatory)
    .filter(available)
    .sort((a, b) => a.title.localeCompare(b.title, ["ru", "en"]));
  renderChecklist(document.getElementById("economicsList"), economicsCourses, "No matching Economics courses available to you yet.");
  const economicsSum = sumPassedCredits(economicsCourses);
  document.getElementById("economicsProgress").textContent = `${economicsSum}/42 credits`;

  // ---- Philosophy: at least 6 credits ----
  const philosophyCourses = courses
    .filter(c => c.subject === "philosophy" && !c.is_mandatory)
    .filter(available)
    .sort((a, b) => a.title.localeCompare(b.title, ["ru", "en"]));
  renderChecklist(document.getElementById("philosophyList"), philosophyCourses, "No matching Philosophy courses available to you yet.");
  const philosophySum = sumPassedCredits(philosophyCourses);
  document.getElementById("philosophyProgress").textContent = `${philosophySum}/6 credits`;

  // ---- Humanities: at least 6 credits ----
  const humanitiesCourses = courses
    .filter(c => c.subject === "humanities" && !c.is_mandatory)
    .filter(available)
    .sort((a, b) => a.title.localeCompare(b.title, ["ru", "en"]));
  renderChecklist(document.getElementById("humanitiesList"), humanitiesCourses, "No matching Humanities courses available to you yet.");
  const humanitiesSum = sumPassedCredits(humanitiesCourses);
  document.getElementById("humanitiesProgress").textContent = `${humanitiesSum}/6 credits`;

  // ---- Social and Science & Math: browsing only, no minimum specified ----
  const socialCourses = courses
    .filter(c => c.subject === "social" && !c.is_mandatory)
    .filter(available)
    .sort((a, b) => a.title.localeCompare(b.title, ["ru", "en"]));
  renderChecklist(document.getElementById("socialList"), socialCourses, "No matching Social courses available to you yet.");

  const scienceMathCourses = courses
    .filter(c => ["math", "science"].includes(c.subject) && !c.is_mandatory)
    .filter(available)
    .sort((a, b) => a.title.localeCompare(b.title, ["ru", "en"]));
  renderChecklist(document.getElementById("scienceMathList"), scienceMathCourses, "No matching Science/Math courses available to you yet.");

  // ---- Results ----
  const missing = [];
  tierProgress.forEach(t => {
    if (t.need > 0) missing.push(`English ${t.tier}: ${t.need} more credit${t.need === 1 ? "" : "s"}`);
  });
  if (economicsSum < 42) missing.push(`Economics: ${42 - economicsSum} more credits`);
  if (philosophySum < 6) missing.push(`Philosophy: ${6 - philosophySum} more credits`);
  if (humanitiesSum < 6) missing.push(`Humanities: ${6 - humanitiesSum} more credits`);

  resultsAreaEl.innerHTML = "";
  const banner = document.createElement("div");
  banner.className = "result-banner" + (missing.length === 0 ? " all-clear" : "");
  banner.innerHTML = missing.length === 0
    ? "All tracked requirements met! 🎉"
    : `Still needed:<br>${missing.join("<br>")}`;
  resultsAreaEl.appendChild(banner);
}

yearSelect.addEventListener("change", () => {
  selectedYear = yearSelect.value || null;
  renderWizard();
});

englishStartSelect.addEventListener("change", () => {
  englishStartLevel = englishStartSelect.value || null;
  renderWizard();
});

// ---------- Theme toggle ----------
const themeToggle = document.getElementById("themeToggle");
function updateThemeButton() {
  themeToggle.textContent = document.documentElement.getAttribute("data-theme") === "dark" ? "☀️" : "🌙";
}
themeToggle.addEventListener("click", () => {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  if (isDark) {
    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("theme", "light");
  } else {
    document.documentElement.setAttribute("data-theme", "dark");
    localStorage.setItem("theme", "dark");
  }
  updateThemeButton();
});
updateThemeButton();

loadCourses();
