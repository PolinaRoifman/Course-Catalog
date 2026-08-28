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

// Which English levels you could plausibly have ALREADY taken, given your
// year and starting level. A first-year student starting at 100 hasn't
// had the chance to take 200 or 300 yet — only chronological progress
// makes a level "available" to mark as passed.
function availableEnglishLevels(year, startLevel) {
  year = Number(year);
  startLevel = Number(startLevel);

  if (startLevel === 100) {
    if (year <= 1) return [100];
    if (year === 2) return [100, 200];
    return [100, 200, 300];
  }
  if (startLevel === 200) {
    if (year <= 1) return [200];
    return [200, 300];
  }
  // startLevel === 300
  return [300];
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

// Subjects with a known hard minimum, shown in the "still needed" list.
// Any other subject just gets a browsable checklist with a credit total,
// no enforced minimum.
const KNOWN_MINIMUMS = { philosophy: 6, humanities: 6 };

// Subjects handled by their own dedicated section already (English has
// its tiered logic, Economics/Philosophy/Humanities have fixed HTML
// blocks) -- everything else gets one dynamically-generated section per
// real subject tag found in the data (Math, Science, Social, Data,
// History, Business, Law, ... whatever actually exists).
const DEDICATED_SUBJECTS = ["english", "economics", "philosophy", "humanities"];

function renderWizard() {
  if (!selectedYear || !englishStartLevel) {
    wizardEl.style.display = "none";
    promptMessageEl.style.display = "block";
    return;
  }
  wizardEl.style.display = "block";
  promptMessageEl.style.display = "none";

  const available = c => isAvailableToYear(c, selectedYear);

  // ---- English: only levels you could chronologically have reached ----
  // 100/200-level courses that share a title are interchangeable parallel
  // sections (same real requirement) -- merge into one checklist entry so
  // credits aren't double-counted and the list isn't confusingly repeated.
  // 300-level (Advanced) courses with the same title are genuinely
  // different courses taught by different professors -- keep them
  // separate, but label each with its professor so they're distinguishable.
  function mergeEnglishForDisplay(list) {
    const seenTitles = new Set();
    const result = [];
    list.forEach(c => {
      if (c._level === 100 || c._level === 200) {
        if (seenTitles.has(c.title)) return;
        seenTitles.add(c.title);
        result.push(c);
      } else {
        const label = c.professor ? `${c.title} — ${c.professor}` : c.title;
        result.push({ ...c, title: label });
      }
    });
    return result;
  }

  const reachableLevels = availableEnglishLevels(selectedYear, englishStartLevel);

  const englishCoursesRaw = courses
    .filter(c => c.subject === "english")
    .map(c => ({ ...c, _level: inferEnglishLevel(c.title) }))
    .filter(c => c._level !== null && reachableLevels.includes(c._level))
    .filter(available)
    .sort((a, b) => a._level - b._level || a.title.localeCompare(b.title, ["ru", "en"]));

  const englishCourses = mergeEnglishForDisplay(englishCoursesRaw);

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

  // ---- Every other subject tag actually present in the data, its own section ----
  const otherSubjects = [...new Set(courses.map(c => c.subject).filter(Boolean))]
    .filter(s => !DEDICATED_SUBJECTS.includes(s))
    .sort();

  const otherContainer = document.getElementById("otherSubjectsContainer");
  otherContainer.innerHTML = "";
  const otherSums = {};

  otherSubjects.forEach(subject => {
    const heading = document.createElement("h3");
    heading.textContent = subject.charAt(0).toUpperCase() + subject.slice(1);
    otherContainer.appendChild(heading);

    const subjCourses = courses
      .filter(c => c.subject === subject && !c.is_mandatory)
      .filter(available)
      .sort((a, b) => a.title.localeCompare(b.title, ["ru", "en"]));

    const sum = sumPassedCredits(subjCourses);
    otherSums[subject] = sum;

    if (KNOWN_MINIMUMS[subject]) {
      const progressLine = document.createElement("p");
      progressLine.className = "progress-line";
      progressLine.textContent = `${sum}/${KNOWN_MINIMUMS[subject]} credits`;
      otherContainer.appendChild(progressLine);
    }

    const list = document.createElement("div");
    list.className = "checklist";
    otherContainer.appendChild(list);
    renderChecklist(list, subjCourses, `No matching ${subject} courses available to you yet.`);
  });

  // ---- Overall totals and results ----
  const missing = [];
  tierProgress.forEach(t => {
    if (t.need > 0) missing.push(`English ${t.tier}: ${t.need} more credit${t.need === 1 ? "" : "s"}`);
  });
  if (economicsSum < 42) missing.push(`Economics: ${42 - economicsSum} more credits`);
  if (philosophySum < 6) missing.push(`Philosophy: ${6 - philosophySum} more credits`);
  if (humanitiesSum < 6) missing.push(`Humanities: ${6 - humanitiesSum} more credits`);
  otherSubjects.forEach(subject => {
    const min = KNOWN_MINIMUMS[subject];
    if (min && otherSums[subject] < min) {
      missing.push(`${subject.charAt(0).toUpperCase() + subject.slice(1)}: ${min - otherSums[subject]} more credits`);
    }
  });

  const overallCredits = sumPassedCredits(courses);

  resultsAreaEl.innerHTML = "";
  const banner = document.createElement("div");
  banner.className = "result-banner" + (missing.length === 0 ? " all-clear" : "");
  const header = `Total credits passed: ${overallCredits}`;
  banner.innerHTML = missing.length === 0
    ? `${header}<br>All tracked requirements met! 🎉`
    : `${header}<br>Still needed:<br>${missing.join("<br>")}`;
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
  themeToggle.textContent = document.documentElement.getAttribute("data-theme") === "dark" ? "Light mode" : "Dark mode";
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