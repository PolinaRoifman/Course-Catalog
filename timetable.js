const supabaseUrl = "https://qrhhucurihbrhnerycgo.supabase.co";
const supabaseKey = "sb_publishable_mhkLtsXDvK3MZd6s2wdnHQ_t-xQLLih";
const db = supabase.createClient(supabaseUrl, supabaseKey);

const DAY_ORDER = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
const DAY_LABEL_EN = {
  "Понедельник": "Monday", "Вторник": "Tuesday", "Среда": "Wednesday",
  "Четверг": "Thursday", "Пятница": "Friday", "Суббота": "Saturday", "Воскресенье": "Sunday",
};
function dayLabel(day) {
  return DAY_LABEL_EN[day] || day || "";
}

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
let englishStartLevel = null;
let chosenEnglishGroup = null; // course_id of the chosen English section, or null

let electiveCourseIds = new Set();
let chosenSeminarByCourse = {};
let activeSubjects = new Set();

const yearSelect = document.getElementById("yearSelect");
const englishStartSelect = document.getElementById("englishStartSelect");
const englishGroupPromptEl = document.getElementById("englishGroupPrompt");
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
const detailNewBadge = document.getElementById("detailNewBadge");
const detailSubline = document.getElementById("detailSubline");
const detailCredits = document.getElementById("detailCredits");
const detailPrereq = document.getElementById("detailPrereq");
const detailDescription = document.getElementById("detailDescription");
const detailAttachment = document.getElementById("detailAttachment");
const commentsListEl = document.getElementById("commentsList");
const commentForm = document.getElementById("commentForm");
const commentStatus = document.getElementById("commentStatus");

let openCourseId = null;

document.getElementById("detailClose").addEventListener("click", closeDetail);

async function openDetail(course) {
  openCourseId = course.id;
  detailTitle.textContent = course.title;
  detailNewBadge.style.display = course.is_new ? "inline-block" : "none";

  const yearsText = toArray(course.years).join(", ");
  const moduleText = toArray(course.module).join(", ");
  detailSubline.textContent = `${course.professor || "TBA"} · ${course.subject || ""}${course.is_mandatory ? " · Mandatory" : ""} · Yr ${yearsText || "—"} · Mod ${moduleText || "—"}${course.semester ? " · " + course.semester : ""}`;
  detailCredits.textContent = `Credits: ${course.credits || 6}`;
  detailPrereq.textContent = course.prerequisites && course.prerequisites.trim()
    ? `Prerequisites: ${course.prerequisites}`
    : "";
  detailDescription.textContent = course.description && course.description.trim()
    ? course.description
    : "No description yet.";
  detailAttachment.innerHTML = course.attachment_url
    ? `<a href="${course.attachment_url}" target="_blank" rel="noopener">📎 View attached document</a>`
    : "";

  commentsListEl.innerHTML = "<p class=\"no-sections\">Loading comments...</p>";
  detailView.classList.add("open");
  window.scrollTo(0, 0);
  await loadComments(course.id);
}

function closeDetail() {
  detailView.classList.remove("open");
  openCourseId = null;
}

function renderAuthor(c) {
  if (c.author_link) {
    const link = c.author_link.trim();
    if (link.startsWith("@")) {
      return `<a href="https://t.me/${link.slice(1)}" target="_blank" rel="noopener">${link}</a>`;
    }
    if (link.startsWith("http")) {
      return `<a href="${link}" target="_blank" rel="noopener">${c.author_name || "Anonymous"}</a>`;
    }
    return `${c.author_name || "Anonymous"} (${link})`;
  }
  return c.author_name || "Anonymous";
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
    const authorHtml = renderAuthor(c);
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

  selectedYear = yearSelect.value || null;

  renderSubjectFilters();
  renderElectivePicker();
  renderSeminarPrompts();
  renderEnglishGroupPrompt();
  renderGrid(gridEl, getAllSelectedIds());
  refreshDraftDropdowns();
  populateKnownSubjects();
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

// ---------- English level grouping ----------
// Certain English courses are really just parallel instructor sections of
// the SAME required course for your year/semester/starting-level, and
// should be presented as one "pick a group" choice rather than separate
// electives. This does NOT apply everywhere -- e.g. Spring's 300-level
// offerings are genuinely different courses, not interchangeable sections.
//
// Rule:
//  Year 1, Autumn -> group whichever level you started at (100/200/300)
//  Year 1, Spring -> group only if you started at 100 or 200 (300 stays elective)
//  Year 2         -> group level 200, only if you started at 100
//  Year 3/4       -> never grouped

function getRequiredEnglishLevel() {
  if (!selectedYear || !englishStartLevel) return null;
  const year = Number(selectedYear);
  const start = Number(englishStartLevel);

  if (year === 1) {
    if (selectedSemester === "autumn") return start;
    if (selectedSemester === "spring") return (start === 100 || start === 200) ? start : null;
    return null;
  }
  if (year === 2) {
    return start === 100 ? 200 : null;
  }
  return null;
}

// English course levels aren't stored explicitly -- inferred from the
// title, same keyword approach as the Calculator.
function inferEnglishLevel(title) {
  const t = (title || "").toLowerCase();
  if (t.includes("beginner") || t.includes("начинающ")) return 100;
  if (t.includes("intermediate") || t.includes("промежуточн")) return 200;
  if (t.includes("advanced") || t.includes("продвинут")) return 300;
  return null;
}

// The set of course rows that should be merged into one grouped choice
// right now, given the current year/semester/starting level. Note: this
// can span MULTIPLE course rows (e.g. Intermediate English-2 exists as
// three separate rows, one per instructor) -- they all get flattened
// into one combined choice below.
function getGroupedEnglishCourses() {
  const level = getRequiredEnglishLevel();
  if (!level || !selectedSemester) return [];
  return courses.filter(c =>
    c.subject === "english" &&
    c.semester === selectedSemester &&
    inferEnglishLevel(c.title) === level
  );
}

// Each REAL group (a course_id + group_number pair -- e.g. Kashcheeva's
// Group 4 vs her Group 5 are different groups, even though same
// instructor and same course) becomes one pickable bucket. Sections with
// no group_number (e.g. a shared lecture) are bucketed per course under
// a "none" key. This flattens across every course row that shares the
// required level, so Spring's three Intermediate English-2 rows appear
// as one combined list of groups, not three separate choices.
function getEnglishGroupBuckets() {
  const groupedCourseIds = new Set(getGroupedEnglishCourses().map(c => c.id));
  const relevant = sections.filter(s => groupedCourseIds.has(s.course_id));

  const buckets = {};
  relevant.forEach(s => {
    const key = `${s.course_id}::${s.group_number != null ? s.group_number : "none"}`;
    if (!buckets[key]) {
      buckets[key] = { key, courseId: s.course_id, groupNumber: s.group_number, sections: [] };
    }
    buckets[key].sections.push(s);
  });
  return Object.values(buckets);
}

function getChosenEnglishSectionIds() {
  if (!chosenEnglishGroup) return [];
  const bucket = getEnglishGroupBuckets().find(b => b.key === chosenEnglishGroup);
  return bucket ? bucket.sections.map(s => s.id) : [];
}

function renderEnglishGroupPrompt() {
  englishGroupPromptEl.innerHTML = "";

  if (!selectedYear || !selectedSemester || !englishStartLevel) {
    englishGroupPromptEl.innerHTML = `<p class="no-sections">Pick your year, semester, and starting English level above.</p>`;
    return;
  }

  const buckets = getEnglishGroupBuckets();

  if (buckets.length === 0) {
    englishGroupPromptEl.innerHTML = `<p class="no-sections">No grouped English requirement this semester -- pick an English elective below if you'd like one.</p>`;
    return;
  }

  const box = document.createElement("div");
  box.className = "seminar-prompt";

  const currentIsValid = buckets.some(b => b.key === chosenEnglishGroup);
  if (!chosenEnglishGroup || !currentIsValid) {
    const warn = document.createElement("div");
    warn.className = "missing";
    warn.textContent = "Pick your English section:";
    box.appendChild(warn);
  }

  buckets
    .sort((a, b) => {
      const instrA = a.sections[0]?.instructor || "";
      const instrB = b.sections[0]?.instructor || "";
      return instrA.localeCompare(instrB, ["ru", "en"]) || (a.groupNumber || 0) - (b.groupNumber || 0);
    })
    .forEach(bucket => {
      const instructor = bucket.sections[0]?.instructor || "TBA";
      const timesText = [...new Set(bucket.sections.map(s => `${dayLabel(s.day)} ${s.start_time}-${s.end_time}`))].join(" & ");
      const groupLabel = bucket.groupNumber != null ? `Gr.${bucket.groupNumber} · ` : "";

      const pill = document.createElement("span");
      pill.className = "section-pill";
      if (chosenEnglishGroup === bucket.key) pill.classList.add("selected");
      pill.textContent = `${groupLabel}${instructor} · ${timesText || "no times yet"}`;

      pill.addEventListener("click", () => {
        chosenEnglishGroup = bucket.key;
        renderEnglishGroupPrompt();
        renderGrid(gridEl, getAllSelectedIds());
      });

      box.appendChild(pill);
    });

  englishGroupPromptEl.appendChild(box);
}

function getMandatoryCourses() {
  if (!selectedYear || !selectedSemester) return [];
  return courses.filter(c =>
    c.is_mandatory &&
    toArray(c.years).map(Number).includes(Number(selectedYear)) &&
    c.semester === selectedSemester
  );
}

function getActiveCourseIds() {
  const mandatoryCourses = getMandatoryCourses();
  const mandatoryIds = mandatoryCourses.map(c => c.id);
  mandatoryIds.forEach(id => electiveCourseIds.delete(id));

  // Grouped English courses are handled entirely by the English
  // Requirement picker -- never through the normal mandatory/elective path.
  const groupedEnglishIds = new Set(getGroupedEnglishCourses().map(c => c.id));
  const filteredMandatory = mandatoryIds.filter(id => !groupedEnglishIds.has(id));
  groupedEnglishIds.forEach(id => electiveCourseIds.delete(id));

  return new Set([...filteredMandatory, ...electiveCourseIds]);
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
  return new Set([...getAutoSectionIds(), ...getChosenSeminarSectionIds(), ...getChosenEnglishSectionIds()]);
}

// ---------- Year/semester selection ----------

yearSelect.addEventListener("change", () => {
  selectedYear = yearSelect.value || null;
  renderElectivePicker(searchBoxEl.value);
  renderSeminarPrompts();
  renderEnglishGroupPrompt();
  renderGrid(gridEl, getAllSelectedIds());
});

document.querySelectorAll(".sem-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".sem-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedSemester = btn.dataset.sem;
    renderElectivePicker(searchBoxEl.value);
    renderSeminarPrompts();
    renderEnglishGroupPrompt();
    renderGrid(gridEl, getAllSelectedIds());
  });
});

englishStartSelect.addEventListener("change", () => {
  englishStartLevel = englishStartSelect.value || null;
  chosenEnglishGroup = null; // starting level changed, previous group choice no longer valid
  renderElectivePicker(searchBoxEl.value);
  renderEnglishGroupPrompt();
  renderGrid(gridEl, getAllSelectedIds());
});

function setSemesterButtons(sem) {
  document.querySelectorAll(".sem-btn").forEach(b => b.classList.toggle("active", b.dataset.sem === sem));
}

// ---------- Seminar group prompts ----------

function renderSeminarPrompts() {
  seminarPromptsEl.innerHTML = "";

  if (!selectedYear || !selectedSemester) {
    seminarPromptsEl.innerHTML = `<p class="no-sections">Pick your year and semester above.</p>`;
    return;
  }

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

  if (!selectedSemester) {
    electivePickerEl.innerHTML = `<p class="no-sections">Pick a semester above to see available electives.</p>`;
    return;
  }

  const mandatoryIds = new Set(getMandatoryCourses().map(c => c.id));
  const groupedEnglishIds = new Set(getGroupedEnglishCourses().map(c => c.id));
  const coursesWithSections = new Set(sections.map(s => s.course_id));

  const visible = courses
    .filter(c => !mandatoryIds.has(c.id))
    .filter(c => !groupedEnglishIds.has(c.id))
    .filter(c => coursesWithSections.has(c.id))
    .filter(c => !selectedYear || toArray(c.years).map(Number).includes(Number(selectedYear)))
    .filter(c => !selectedSemester || c.semester === selectedSemester)
    .filter(c => activeSubjects.size === 0 || activeSubjects.has(c.subject))
    .filter(c => c.title.toLowerCase().includes(filterText.toLowerCase()))
    .sort((a, b) => a.title.localeCompare(b.title, ["ru", "en"]));

  if (visible.length === 0) {
    electivePickerEl.innerHTML = `<p class="no-sections">No matching courses with scheduled sections for this year/semester.</p>`;
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

// ---------- Weekly grid ----------

const CAMPUS_LETTER_ROOM = /^[a-zA-Zа-яА-Я]/;

function isOnlineRoom(room) {
  return !!room && room.toLowerCase().includes("online");
}

function campusOf(section) {
  // Explicitly tagged (e.g. a manually-added external course) always wins.
  if (section.campus === "NES" || section.campus === "HSE") return section.campus;
  const room = section.room;
  if (!room || isOnlineRoom(room)) return null;
  return CAMPUS_LETTER_ROOM.test(room.trim()) ? "letter" : "number";
}

function dayHasMixedCampuses(day, chosen) {
  const campuses = new Set(
    chosen.filter(s => s.day === day).map(s => campusOf(s)).filter(Boolean)
  );
  return campuses.size > 1;
}

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

  const days = DAY_ORDER.slice(0, 6);
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
    englishStartLevel,
    chosenEnglishGroup,
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

// Pure version of the English-level rule, for evaluating a saved draft
// without touching live state.
function requiredEnglishLevelFor(year, semester, startLevel) {
  if (!year || !startLevel) return null;
  year = Number(year);
  startLevel = Number(startLevel);
  if (year === 1) {
    if (semester === "autumn") return startLevel;
    if (semester === "spring") return (startLevel === 100 || startLevel === 200) ? startLevel : null;
    return null;
  }
  if (year === 2) return startLevel === 100 ? 200 : null;
  return null;
}

function groupedEnglishCourseIdsFor(year, semester, startLevel) {
  const level = requiredEnglishLevelFor(year, semester, startLevel);
  if (!level || !semester) return new Set();
  return new Set(
    courses
      .filter(c => c.subject === "english" && c.semester === semester && inferEnglishLevel(c.title) === level)
      .map(c => c.id)
  );
}

function idsForDraftPayload(payload) {
  if (!payload) return new Set();

  const groupedEnglishIds = groupedEnglishCourseIdsFor(payload.year, payload.semester, payload.englishStartLevel);

  const mandatoryCourseIds = courses
    .filter(c =>
      c.is_mandatory &&
      toArray(c.years).map(Number).includes(Number(payload.year)) &&
      c.semester === payload.semester &&
      !groupedEnglishIds.has(c.id)
    )
    .map(c => c.id);

  const activeIds = new Set([...mandatoryCourseIds, ...(payload.electiveCourseIds || [])]);

  const autoIds = [];
  activeIds.forEach(courseId => {
    sections
      .filter(s => s.course_id === courseId && (s.session_type === "lecture" || !s.session_type))
      .forEach(s => autoIds.push(s.id));
  });

  if (payload.chosenEnglishGroup) {
    const [courseIdStr, groupStr] = payload.chosenEnglishGroup.split("::");
    const courseId = Number(courseIdStr);
    sections
      .filter(s =>
        s.course_id === courseId &&
        (groupStr === "none" ? s.group_number == null : String(s.group_number) === groupStr)
      )
      .forEach(s => autoIds.push(s.id));
  }

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
  englishStartLevel = payload.englishStartLevel || null;
  chosenEnglishGroup = payload.chosenEnglishGroup || null;
  yearSelect.value = selectedYear || "";
  englishStartSelect.value = englishStartLevel || "";
  setSemesterButtons(selectedSemester);
  chosenSeminarByCourse = payload.chosenSeminarByCourse || {};
  electiveCourseIds = new Set(payload.electiveCourseIds || []);

  renderElectivePicker(searchBoxEl.value);
  renderSeminarPrompts();
  renderEnglishGroupPrompt();
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

// ---------- Add a course from another program ----------

let pendingMeetings = [];

const extTitle = document.getElementById("ext_title");
const extProgram = document.getElementById("ext_program");
const extProfessor = document.getElementById("ext_professor");
const extCredits = document.getElementById("ext_credits");
const extSubject = document.getElementById("ext_subject");
const extCampus = document.getElementById("ext_campus");
const knownSubjectsList = document.getElementById("knownSubjects");
const extDay = document.getElementById("ext_day");
const extStart = document.getElementById("ext_start");
const extEnd = document.getElementById("ext_end");
const pendingMeetingsListEl = document.getElementById("pendingMeetingsList");
const externalCourseForm = document.getElementById("externalCourseForm");
const externalCourseStatus = document.getElementById("externalCourseStatus");

function populateKnownSubjects() {
  const known = [...new Set(courses.map(c => c.subject).filter(Boolean))].sort();
  knownSubjectsList.innerHTML = known.map(s => `<option value="${s}"></option>`).join("");
}

function renderPendingMeetings() {
  pendingMeetingsListEl.innerHTML = "";
  pendingMeetings.forEach((m, idx) => {
    const chip = document.createElement("span");
    chip.className = "pending-meeting";
    chip.innerHTML = `${dayLabel(m.day)} ${m.start}-${m.end} <button type="button" data-idx="${idx}">✕</button>`;
    chip.querySelector("button").addEventListener("click", () => {
      pendingMeetings.splice(idx, 1);
      renderPendingMeetings();
    });
    pendingMeetingsListEl.appendChild(chip);
  });
}

document.getElementById("addMeetingBtn").addEventListener("click", () => {
  const day = extDay.value;
  const start = extStart.value.trim();
  const end = extEnd.value.trim();
  if (!start || !end) {
    alert("Fill in both start and end time first.");
    return;
  }
  pendingMeetings.push({ day, start, end });
  renderPendingMeetings();
  extStart.value = "";
  extEnd.value = "";
});

externalCourseForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (pendingMeetings.length === 0) {
    alert("Add at least one meeting time first.");
    return;
  }

  externalCourseStatus.textContent = "Adding...";

  const { data: courseRows, error: courseError } = await db.from("courses").insert({
    title: extTitle.value.trim(),
    external_program: extProgram.value.trim(),
    professor: extProfessor.value.trim() || null,
    credits: Number(extCredits.value) || 6,
    subject: extSubject.value.trim() || null,
    is_mandatory: false,
    semester: selectedSemester || null,
    years: selectedYear ? [Number(selectedYear)] : null,
  }).select();

  if (courseError || !courseRows || courseRows.length === 0) {
    console.error("Error adding external course:", courseError);
    externalCourseStatus.textContent = "Failed to add course -- check the console.";
    return;
  }

  const newCourse = courseRows[0];

  const sectionRows = pendingMeetings.map(m => ({
    course_id: newCourse.id,
    title: newCourse.title,
    session_type: null,
    day: m.day,
    start_time: m.start,
    end_time: m.end,
    instructor: newCourse.professor,
    years: newCourse.years,
    subject: newCourse.subject,
    semester: newCourse.semester,
    campus: extCampus.value || null,
  }));

  const { error: sectionError } = await db.from("sections").insert(sectionRows);

  if (sectionError) {
    console.error("Error adding sections:", sectionError);
    externalCourseStatus.textContent = "Course added, but failed to add meeting times -- check the console.";
  } else {
    externalCourseStatus.textContent = "Added!";
  }

  // Refresh local data so the new course/sections are usable immediately,
  // then drop it straight into the current draft.
  await loadAll();
  electiveCourseIds.add(newCourse.id);
  renderElectivePicker(searchBoxEl.value);
  renderSeminarPrompts();
  renderEnglishGroupPrompt();
  renderGrid(gridEl, getAllSelectedIds());

  externalCourseForm.reset();
  pendingMeetings = [];
  renderPendingMeetings();
  setTimeout(() => { externalCourseStatus.textContent = ""; }, 2500);
});

loadAll();