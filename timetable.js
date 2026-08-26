const supabaseUrl = "https://qrhhucurihbrhnerycgo.supabase.co";
const supabaseKey = "sb_publishable_mhkLtsXDvK3MZd6s2wdnHQ_t-xQLLih";
const db = supabase.createClient(supabaseUrl, supabaseKey);

const DAY_ORDER = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
const DAY_LABEL_EN = {
  "Понедельник": "Monday",
  "Вторник": "Tuesday",
  "Среда": "Wednesday",
  "Четверг": "Thursday",
  "Пятница": "Friday",
  "Суббота": "Saturday",
  "Воскресенье": "Sunday",
};
function dayLabel(day) {
  return DAY_LABEL_EN[day] || day || "";
}

// A fixed, evenly-spaced palette so every subject gets a genuinely
// distinct color, instead of a hash that can collide between subjects.
const SUBJECT_PALETTE = [];
for (let i = 0; i < 18; i++) {
  SUBJECT_PALETTE.push(`hsl(${i * 20}, 48%, 32%)`);
}

let subjectColorMap = {};

function buildSubjectColorMap() {
  const allSubjects = [...new Set([
    ...courses.map(c => c.subject),
    ...sections.map(s => s.subject),
  ].filter(Boolean))].sort();

  subjectColorMap = {};
  allSubjects.forEach((subj, i) => {
    subjectColorMap[subj] = SUBJECT_PALETTE[i % SUBJECT_PALETTE.length];
  });
}

function subjectColor(subject) {
  if (!subject) return "#888";
  return subjectColorMap[subject] || "#888";
}

let courses = [];
let sections = [];

let selectedYear = null;
let selectedSemester = null;

let electiveCourseIds = new Set();
let chosenSeminarByCourse = {}; // course_id -> group key
let activeSubjects = new Set();

const yearSelect = document.getElementById("yearSelect");
const semesterSelect = document.getElementById("semesterSelect");
const seminarPromptsEl = document.getElementById("seminarPrompts");
const gridEl = document.getElementById("grid");
const subjectFiltersEl = document.getElementById("subjectFilters");
const searchBoxEl = document.getElementById("searchBox");
const electivePickerEl = document.getElementById("electivePicker");

const draftNameInput = document.getElementById("draftNameInput");
const draftLoadSelect = document.getElementById("draftLoadSelect");
const compareASelect = document.getElementById("compareASelect");
const compareBSelect = document.getElementById("compareBSelect");
const compareRowEl = document.getElementById("compareRow");

// ---------- Detail view (description + comments) ----------

const detailView = document.getElementById("detailView");
const detailTitle = document.getElementById("detailTitle");
const detailMeta = document.getElementById("detailMeta");
const detailDescription = document.getElementById("detailDescription");
const commentsListEl = document.getElementById("commentsList");
const commentForm = document.getElementById("commentForm");
const commentStatus = document.getElementById("commentStatus");

let openCourseId = null;

document.getElementById("detailClose").addEventListener("click", closeDetail);

async function openDetail(course) {
  openCourseId = course.id;
  detailTitle.textContent = course.title;
  const yearsText = toArray(course.years).join(", ");
  const moduleText = toArray(course.module).join(", ");
  detailMeta.textContent = `${course.subject || ""} · ${course.professor || ""} · Yr ${yearsText || "—"} · Mod ${moduleText || "—"}${course.is_mandatory ? " · mandatory" : ""}`;
  detailDescription.textContent = course.description && course.description.trim()
    ? course.description
    : "No description yet.";
  commentsListEl.innerHTML = "<p class=\"no-sections\">Loading comments...</p>";
  detailView.classList.add("open");
  window.scrollTo(0, 0);
  await loadComments(course.id);
}

function closeDetail() {
  detailView.classList.remove("open");
  openCourseId = null;
}

async function loadComments(courseId) {
  const { data, error } = await db
    .from("comments")
    .select("*")
    .eq("course_id", courseId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading comments:", error);
    commentsListEl.innerHTML = "<p class=\"no-sections\">Couldn't load comments.</p>";
    return;
  }

  if (data.length === 0) {
    commentsListEl.innerHTML = "<p class=\"no-sections\">No comments yet.</p>";
    return;
  }

  commentsListEl.innerHTML = "";
  data.forEach(c => {
    const item = document.createElement("div");
    item.className = "comment-item";
    const authorHtml = c.author_link
      ? `<a href="${c.author_link}" target="_blank" rel="noopener">${c.author_name || "Anonymous"}</a>`
      : (c.author_name || "Anonymous");
    const badge = c.professor_unchanged ? `<span class="comment-badge">professor unchanged</span>` : "";
    const date = c.created_at ? new Date(c.created_at).toLocaleDateString() : "";
    item.innerHTML = `
      <span class="comment-author">${authorHtml}</span>${badge}<span class="comment-date">${date}</span>
      <p>${c.comment || ""}</p>
    `;
    commentsListEl.appendChild(item);
  });
}

commentForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!openCourseId) return;

  const authorName = document.getElementById("c_author_name").value.trim();
  const authorLink = document.getElementById("c_author_link").value.trim() || null;
  const text = document.getElementById("c_text").value.trim();
  const professorUnchanged = document.getElementById("c_professor_unchanged").checked;

  commentStatus.textContent = "Posting...";

  const { error } = await db.from("comments").insert({
    course_id: openCourseId,
    author_name: authorName,
    author_link: authorLink,
    comment: text,
    professor_unchanged: professorUnchanged,
  });

  if (error) {
    console.error("Error posting comment:", error);
    commentStatus.textContent = "Failed to post — check the console.";
    return;
  }

  commentForm.reset();
  document.getElementById("c_professor_unchanged").checked = true;
  commentStatus.textContent = "Posted.";
  await loadComments(openCourseId);
  setTimeout(() => { commentStatus.textContent = ""; }, 2000);
});

// ---------- Loading real data ----------

async function loadAll() {
  const [coursesRes, sectionsRes] = await Promise.all([
    db.from("courses").select("*"),
    db.from("sections").select("*"),
  ]);

  if (coursesRes.error || sectionsRes.error) {
    console.error("Error loading data:", coursesRes.error || sectionsRes.error);
    return;
  }

  courses = coursesRes.data;
  sections = sectionsRes.data;
  buildSubjectColorMap();

  // Browsers can preserve <select> values across a refresh, so read
  // whatever the dropdowns already show rather than waiting for a
  // "change" event that may never fire.
  selectedYear = yearSelect.value || null;
  selectedSemester = semesterSelect.value || null;

  renderSubjectFilters();
  renderElectivePicker();
  renderSeminarPrompts();
  renderGrid(gridEl, getAllSelectedIds());
  refreshDraftDropdowns();
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

// ---------- Which courses are "active" (mandatory + elective) ----------

function getMandatoryCourses() {
  if (!selectedYear || !selectedSemester) return [];
  return courses.filter(c =>
    c.is_mandatory &&
    toArray(c.years).map(Number).includes(Number(selectedYear)) &&
    c.semester === selectedSemester
  );
}

function getActiveCourseIds() {
  const mandatoryIds = getMandatoryCourses().map(c => c.id);
  mandatoryIds.forEach(id => electiveCourseIds.delete(id)); // never removable once mandatory
  return new Set([...mandatoryIds, ...electiveCourseIds]);
}

function getAutoSectionIds() {
  const ids = [];
  getActiveCourseIds().forEach(courseId => {
    sections
      .filter(s => s.course_id === courseId && (s.session_type === "lecture" || !s.session_type))
      .forEach(s => ids.push(s.id));
  });
  return ids;
}

function getChosenSeminarSectionIds() {
  const ids = [];
  Object.entries(chosenSeminarByCourse).forEach(([courseId, groupKey]) => {
    sections
      .filter(s =>
        s.course_id === Number(courseId) &&
        s.session_type === "seminar" &&
        String(s.group_number ?? "none") === String(groupKey)
      )
      .forEach(s => ids.push(s.id));
  });
  return ids;
}

function getAllSelectedIds() {
  return new Set([...getAutoSectionIds(), ...getChosenSeminarSectionIds()]);
}

// ---------- Year/semester selection ----------

yearSelect.addEventListener("change", () => {
  selectedYear = yearSelect.value || null;
  renderElectivePicker(searchBoxEl.value);
  renderSeminarPrompts();
  renderGrid(gridEl, getAllSelectedIds());
});

semesterSelect.addEventListener("change", () => {
  selectedSemester = semesterSelect.value || null;
  renderElectivePicker(searchBoxEl.value);
  renderSeminarPrompts();
  renderGrid(gridEl, getAllSelectedIds());
});

// ---------- Seminar group prompts ----------

function renderSeminarPrompts() {
  seminarPromptsEl.innerHTML = "";

  const activeIds = getActiveCourseIds();
  const withSeminars = [...activeIds]
    .map(id => courses.find(c => c.id === id))
    .filter(Boolean)
    .map(course => ({
      course,
      seminars: sections.filter(s => s.course_id === course.id && s.session_type === "seminar"),
    }))
    .filter(x => x.seminars.length > 0);

  if (withSeminars.length === 0) {
    seminarPromptsEl.innerHTML = `<p class="no-sections">No seminar choices needed right now.</p>`;
    return;
  }

  withSeminars.forEach(({ course, seminars }) => {
    const box = document.createElement("div");
    box.className = "seminar-prompt";

    const title = document.createElement("div");
    title.className = "course-title course-title-link";
    title.textContent = course.title;
    title.addEventListener("click", () => openDetail(course));
    box.appendChild(title);

    if (course.prerequisites && course.prerequisites.trim()) {
      const badge = document.createElement("span");
      badge.className = "prereq-badge";
      badge.textContent = `Requires: ${course.prerequisites}`;
      box.appendChild(badge);
    }

    if (chosenSeminarByCourse[course.id] === undefined) {
      const warn = document.createElement("div");
      warn.className = "missing";
      warn.textContent = "Pick a seminar group:";
      box.appendChild(warn);
    }

    const byGroup = {};
    seminars.forEach(sec => {
      const key = sec.group_number ?? "none";
      if (!byGroup[key]) byGroup[key] = [];
      byGroup[key].push(sec);
    });

    Object.entries(byGroup)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .forEach(([groupKey, groupSections]) => {
        const pill = document.createElement("span");
        pill.className = "section-pill";
        if (chosenSeminarByCourse[course.id] === groupKey) pill.classList.add("selected");

        const timesText = groupSections
          .map(s => `${dayLabel(s.day)} ${s.start_time}-${s.end_time}`)
          .join(" & ");
        const instructor = groupSections[0].instructor || "";
        pill.textContent = `Gr.${groupKey} · ${timesText} · ${instructor}`;

        pill.addEventListener("click", () => {
          chosenSeminarByCourse[course.id] = groupKey;
          renderSeminarPrompts();
          renderGrid(gridEl, getAllSelectedIds());
        });

        box.appendChild(pill);
      });

    seminarPromptsEl.appendChild(box);
  });
}

// ---------- Electives ----------

function renderSubjectFilters() {
  subjectFiltersEl.innerHTML = "";
  const subjects = [...new Set(courses.map(c => c.subject).filter(Boolean))].sort();

  const allBtn = document.createElement("button");
  allBtn.textContent = "All subjects";
  if (activeSubjects.size === 0) allBtn.classList.add("active");
  allBtn.addEventListener("click", () => {
    activeSubjects.clear();
    renderSubjectFilters();
    renderElectivePicker(searchBoxEl.value);
  });
  subjectFiltersEl.appendChild(allBtn);

  subjects.forEach(subject => {
    const btn = document.createElement("button");
    btn.textContent = subject;
    if (activeSubjects.has(subject)) btn.classList.add("active");
    btn.addEventListener("click", () => {
      if (activeSubjects.has(subject)) activeSubjects.delete(subject);
      else activeSubjects.add(subject);
      renderSubjectFilters();
      renderElectivePicker(searchBoxEl.value);
    });
    subjectFiltersEl.appendChild(btn);
  });
}

function renderElectivePicker(filterText = "") {
  electivePickerEl.innerHTML = "";

  const mandatoryIds = new Set(getMandatoryCourses().map(c => c.id));
  const coursesWithSections = new Set(sections.map(s => s.course_id));

  const visible = courses
    .filter(c => !mandatoryIds.has(c.id))
    .filter(c => coursesWithSections.has(c.id)) // no time slots at all -> nothing to add, hide it
    .filter(c => !selectedYear || toArray(c.years).map(Number).includes(Number(selectedYear))) // not open to your year
    .filter(c => !selectedSemester || c.semester === selectedSemester) // not offered this semester
    .filter(c => activeSubjects.size === 0 || activeSubjects.has(c.subject))
    .filter(c => c.title.toLowerCase().includes(filterText.toLowerCase()))
    .sort((a, b) => a.title.localeCompare(b.title, ["ru", "en"]));

  if (visible.length === 0) {
    electivePickerEl.innerHTML = `<p class="no-sections">No matching courses with scheduled sections.</p>`;
    return;
  }

  visible.forEach(course => {
    const row = document.createElement("div");
    row.className = "elective-row";

    const isActive = electiveCourseIds.has(course.id);

    const label = document.createElement("span");
    label.className = "elective-title";
    label.textContent = course.title;
    label.addEventListener("click", () => openDetail(course));
    row.appendChild(label);

    const btn = document.createElement("button");
    btn.className = "elective-toggle" + (isActive ? " active" : "");
    btn.textContent = isActive ? "Remove" : "Add";

    btn.addEventListener("click", () => {
      if (isActive) {
        electiveCourseIds.delete(course.id);
        delete chosenSeminarByCourse[course.id];
      } else {
        electiveCourseIds.add(course.id);
      }
      renderElectivePicker(filterText);
      renderSeminarPrompts();
      renderGrid(gridEl, getAllSelectedIds());
    });

    row.appendChild(btn);

    if (course.prerequisites && course.prerequisites.trim()) {
      const badge = document.createElement("span");
      badge.className = "prereq-badge";
      badge.textContent = `Requires: ${course.prerequisites}`;
      row.appendChild(badge);
    }

    electivePickerEl.appendChild(row);
  });
}

searchBoxEl.addEventListener("input", () => renderElectivePicker(searchBoxEl.value));

// ---------- Weekly grid: one continuous timeline, real clock-time positions ----------
// Days are always shown Monday->Saturday, in order. Monday/Thursday classes
// run on slightly different real start times than other days (NES vs HSE
// campus timing) — placing every class at its actual time naturally shows
// that as a small vertical shift, instead of needing a separate table.

function computeTimeBounds() {
  let min = Infinity, max = -Infinity;
  sections.forEach(s => {
    const start = timeToMinutes(s.start_time);
    const end = timeToMinutes(s.end_time);
    if (start < min) min = start;
    if (end > max) max = end;
  });
  if (!isFinite(min)) { min = 9 * 60; max = 21 * 60; }
  return { min, max };
}

// A room like "R201" or "D511" (starts with a letter) is one campus;
// a bare number like "341" or "405.2" is the other. "online" is its own
// category and doesn't count as either physical campus.
function isOnlineRoom(room) {
  return !!room && room.toLowerCase().includes("online");
}

function campusOf(room) {
  if (!room || isOnlineRoom(room)) return null;
  const first = room.trim()[0];
  return /[a-zA-Zа-яА-Я]/.test(first) ? "letter" : "number";
}

// True if this day's selected classes span BOTH physical campus types —
// same idea as a time conflict, but flagged at the whole-day level.
function dayHasMixedCampuses(day, chosen) {
  const campuses = new Set(
    chosen
      .filter(s => s.day === day)
      .map(s => campusOf(s.room))
      .filter(Boolean)
  );
  return campuses.size > 1;
}

// Groups same-day overlapping sections into clusters so conflicting
// classes sit side-by-side (split width) instead of fully overlapping.
function layoutDayBlocks(day, chosen, min, scale) {
  const daySections = chosen
    .filter(s => s.day === day)
    .map(s => ({
      ...s,
      startMin: timeToMinutes(s.start_time),
      endMin: timeToMinutes(s.end_time),
    }))
    .sort((a, b) => a.startMin - b.startMin);

  const clusters = [];
  daySections.forEach(sec => {
    const cluster = clusters.find(cl => cl.some(o => sec.startMin < o.endMin && o.startMin < sec.endMin));
    if (cluster) cluster.push(sec);
    else clusters.push([sec]);
  });

  const layout = [];
  clusters.forEach(cluster => {
    const n = cluster.length;
    cluster.forEach((sec, idx) => {
      layout.push({
        ...sec,
        top: (sec.startMin - min) * scale,
        height: (sec.endMin - sec.startMin) * scale,
        leftPct: idx * (100 / n),
        widthPct: 100 / n,
        conflict: n > 1,
      });
    });
  });
  return layout;
}

function renderGrid(container, idSet) {
  container.innerHTML = "";

  const days = DAY_ORDER.slice(0, 6); // Monday -> Saturday, always in order
  const { min, max } = computeTimeBounds();
  const HEIGHT_PX = 640;
  const scale = HEIGHT_PX / (max - min);

  container.style.gridTemplateColumns = `60px repeat(${days.length}, 1fr)`;

  container.appendChild(makeCell("", "header"));
  days.forEach(d => container.appendChild(makeCell(dayLabel(d), "header")));

  const axis = document.createElement("div");
  axis.className = "day-col time-axis";
  axis.style.height = HEIGHT_PX + "px";
  for (let t = Math.ceil(min / 60) * 60; t <= max; t += 60) {
    const tick = document.createElement("div");
    tick.className = "time-tick";
    tick.style.top = ((t - min) * scale) + "px";
    tick.textContent = `${String(Math.floor(t / 60)).padStart(2, "0")}:00`;
    axis.appendChild(tick);
  }
  container.appendChild(axis);

  const chosen = sections.filter(s => idSet.has(s.id));

  days.forEach(day => {
    const col = document.createElement("div");
    col.className = "day-col";
    if (dayHasMixedCampuses(day, chosen)) col.classList.add("mixed-campus");
    col.style.height = HEIGHT_PX + "px";

    layoutDayBlocks(day, chosen, min, scale).forEach(item => {
      const block = document.createElement("div");
      block.className = "class-block-abs" + (item.conflict ? " conflict" : "") + (isOnlineRoom(item.room) ? " online" : "");
      block.style.top = item.top + "px";
      block.style.height = Math.max(item.height, 24) + "px";
      block.style.left = item.leftPct + "%";
      block.style.width = `calc(${item.widthPct}% - 4px)`;
      block.style.borderLeftColor = subjectColor(item.subject);
      const typeLabel = item.session_type === "lecture" ? "Lec"
        : item.session_type === "seminar" ? `Sem${item.group_number ? " " + item.group_number : ""}`
        : "";
      const course = courses.find(c => c.id === item.course_id);
      const prereqLine = course && course.prerequisites && course.prerequisites.trim()
        ? `<div class="prereq-inline">Req: ${course.prerequisites}</div>`
        : "";
      block.innerHTML = `<strong>${item.title}</strong> ${typeLabel}<br>${item.instructor || ""}${item.room ? " · " + item.room : ""}${prereqLine}`;
      col.appendChild(block);
    });

    container.appendChild(col);
  });
}

function makeCell(text, cls) {
  const div = document.createElement("div");
  div.className = `cell ${cls}`;
  div.textContent = text;
  return div;
}

// ---------- Drafts, saved in localStorage (no login yet) ----------

function getDraftNames() {
  const raw = localStorage.getItem("draft:__names__");
  return raw ? JSON.parse(raw) : [];
}

function setDraftNames(names) {
  localStorage.setItem("draft:__names__", JSON.stringify(names));
}

function saveDraft(name) {
  const payload = {
    year: selectedYear,
    semester: selectedSemester,
    chosenSeminarByCourse,
    electiveCourseIds: [...electiveCourseIds],
  };
  localStorage.setItem(`draft:${name}`, JSON.stringify(payload));
  const names = getDraftNames();
  if (!names.includes(name)) {
    names.push(name);
    setDraftNames(names);
  }
}

function loadDraftPayload(name) {
  const raw = localStorage.getItem(`draft:${name}`);
  return raw ? JSON.parse(raw) : null;
}

function deleteDraft(name) {
  localStorage.removeItem(`draft:${name}`);
  setDraftNames(getDraftNames().filter(n => n !== name));
}

function refreshDraftDropdowns() {
  const names = getDraftNames();
  [draftLoadSelect, compareASelect, compareBSelect].forEach(select => {
    select.innerHTML = "";
    if (names.length === 0) {
      select.innerHTML = `<option value="">No drafts saved</option>`;
      return;
    }
    names.forEach(n => {
      const opt = document.createElement("option");
      opt.value = n;
      opt.textContent = n;
      select.appendChild(opt);
    });
  });
}

function idsForDraftPayload(payload) {
  if (!payload) return new Set();

  const mandatoryCourseIds = courses
    .filter(c =>
      c.is_mandatory &&
      toArray(c.years).map(Number).includes(Number(payload.year)) &&
      c.semester === payload.semester
    )
    .map(c => c.id);

  const activeIds = new Set([...mandatoryCourseIds, ...(payload.electiveCourseIds || [])]);

  const autoIds = [];
  activeIds.forEach(courseId => {
    sections
      .filter(s => s.course_id === courseId && (s.session_type === "lecture" || !s.session_type))
      .forEach(s => autoIds.push(s.id));
  });

  const seminarIds = [];
  Object.entries(payload.chosenSeminarByCourse || {}).forEach(([courseId, groupKey]) => {
    sections
      .filter(s =>
        s.course_id === Number(courseId) &&
        s.session_type === "seminar" &&
        String(s.group_number ?? "none") === String(groupKey)
      )
      .forEach(s => seminarIds.push(s.id));
  });

  return new Set([...autoIds, ...seminarIds]);
}

document.getElementById("saveDraftBtn").addEventListener("click", () => {
  const name = draftNameInput.value.trim();
  if (!name) {
    alert("Give the draft a name first.");
    return;
  }
  saveDraft(name);
  refreshDraftDropdowns();
  draftNameInput.value = "";
});

document.getElementById("loadDraftBtn").addEventListener("click", () => {
  const name = draftLoadSelect.value;
  const payload = loadDraftPayload(name);
  if (!payload) return;

  selectedYear = payload.year;
  selectedSemester = payload.semester;
  yearSelect.value = selectedYear || "";
  semesterSelect.value = selectedSemester || "";
  chosenSeminarByCourse = payload.chosenSeminarByCourse || {};
  electiveCourseIds = new Set(payload.electiveCourseIds || []);

  renderElectivePicker(searchBoxEl.value);
  renderSeminarPrompts();
  renderGrid(gridEl, getAllSelectedIds());
});

document.getElementById("deleteDraftBtn").addEventListener("click", () => {
  const name = draftLoadSelect.value;
  if (!name) return;
  deleteDraft(name);
  refreshDraftDropdowns();
});

document.getElementById("compareBtn").addEventListener("click", () => {
  const nameA = compareASelect.value;
  const nameB = compareBSelect.value;

  compareRowEl.innerHTML = "";

  [nameA, nameB].forEach(name => {
    const col = document.createElement("div");
    col.className = "compare-col";

    const title = document.createElement("h4");
    title.textContent = name || "(none)";
    col.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "week-grid-outer";
    col.appendChild(grid);

    compareRowEl.appendChild(col);

    if (name) renderGrid(grid, idsForDraftPayload(loadDraftPayload(name)));
  });
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

loadAll();