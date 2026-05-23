const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const BASELINE_DATE = new Date(2026, 5, 2); // May 18, 2025 (Month parameter is 0-indexed, so 4 is May)

// Primary Engine Relational Repositories Maps
let database = { categories: [], topicsHub: {} };
let scheduleData = {};
let currentWeek = 1;
let activeTarget = { day: null, index: null, topicKey: null };

// Helper to calculate custom header string formatting for ranges
function getWeekRangeString(weekNumber) {
	let start = new Date(BASELINE_DATE.getTime());
	start.setDate(start.getDate() + (weekNumber - 1) * 7);

	let end = new Date(start.getTime());
	end.setDate(end.getDate() + 6);

	if (isNaN(start.getTime()) || isNaN(end.getTime())) {
		return "";
	}

	let startStr = String(start.getDate()).padStart(2, '0') + '.' + String(start.getMonth() + 1).padStart(2, '0') + '.' + start.getFullYear();
	let endStr = String(end.getDate()).padStart(2, '0') + '.' + String(end.getMonth() + 1).padStart(2, '0') + '.' + end.getFullYear();

	return `Week ${weekNumber} (${startStr} - ${endStr})`;
}

// Finds the earliest week in your stored data that has any tasks set up
function findFirstConfiguredWeek() {
	let keys = Object.keys(scheduleData).map(Number).filter(k => !isNaN(k));

	if (keys.length === 0) {
		return 1;
	}

	let earliestWithContent = Infinity;

	keys.forEach(w => {
		let hasData = false;
		if (scheduleData[w]) {
			Object.keys(scheduleData[w]).forEach(day => {
				if (Array.isArray(scheduleData[w][day])) {
					scheduleData[w][day].forEach(slot => {
						if (slot !== null && slot !== "__EXPLICIT_EMPTY__") {
							hasData = true;
						}
					});
				}
			});
		}
		if (hasData && w < earliestWithContent) {
			earliestWithContent = w;
		}
	});

	if (earliestWithContent === Infinity) {
		return 1;
	}

	return earliestWithContent;
}

// 1. App Startup Engine
async function init() {
	// Look for existing local storage records first
	const savedDb = localStorage.getItem('study_planner_db_v3');
	const savedSchedule = localStorage.getItem('study_planner_schedule_v3');
	const savedLastViewedWeek = localStorage.getItem('study_planner_last_week_v3');

	if (savedDb) {
		database = JSON.parse(savedDb);
	} else {
		// Seeding default local fallback template records gracefully on initial empty system setup state
		try {
			const response = await fetch('topics.json');
			const dataFromFile = await response.json();
			database.categories = dataFromFile.categories;
			database.categories.forEach(cat => {
				cat.topics.forEach(topicName => {
					database.topicsHub[topicName] = { description: "", resources: [] };
				});
			});
		} catch (e) {
			// Hardcode baseline setup if topics.json fallback is missing entirely
			database.categories = [
				{ id: "gen_cs", name: "Computer Science", color: "#10b981", topics: ["Linux", "Vim"] },
				{ id: "gen_languages", name:"Languages", color: "#666666", topics: ["German", "Russian"] }
			];

			database.topicsHub["Linux"] = { description: "", resources: [] };
			database.topicsHub["Vim"] = { description: "", resources: [] };

			database.topicsHub["German"] = {description: "", resources: [] };
			database.topicsHub["Russian"] = {description: "", resources: [] };
		}
		saveDb();
	}

	if (savedSchedule) {
		scheduleData = JSON.parse(savedSchedule);
	}

	// Set week selection context based on navigation history or first setup location data
	if (savedLastViewedWeek) {
		currentWeek = Number(savedLastViewedWeek) || 1;
	} else {
		currentWeek = findFirstConfiguredWeek();
		localStorage.setItem('study_planner_last_week_v3', currentWeek);
	}

	renderCalendar();
	buildSelectionMenu();
}

// Resolves what topic should structurally render in a given slot, tracking upwards recursively
function getEffectiveTopic(week, day, index) {
	if (week < 1) {
		return { name: null, type: 'empty' };
	}

	if (!scheduleData[week] || !scheduleData[week][day] || scheduleData[week][day][index] === undefined) {
		return getEffectiveTopic(week - 1, day, index);
	}

	const slotValue = scheduleData[week][day][index];

	if (slotValue === "__EXPLICIT_EMPTY__") {
		return { name: null, type: 'empty' };
	}

	if (slotValue !== null) {
		if (week === currentWeek) {
			return { name: slotValue, type: 'assigned' };
		}
		return { name: slotValue, type: 'inherited' };
	}

	return getEffectiveTopic(week - 1, day, index);
}

// 2. Dash View Layout Rendering System
function renderCalendar() {
	document.getElementById('weekDisplay').textContent = getWeekRangeString(currentWeek);
	const grid = document.getElementById('calendarGrid');
	grid.innerHTML = '';

	if (!scheduleData[currentWeek]) {
		scheduleData[currentWeek] = {};
		DAYS.forEach(day => { scheduleData[currentWeek][day] = [null, null]; });
	}

	// Maximum layout slot baseline alignment logic
	DAYS.forEach(day => {
		let prevMax = 0;
		for (let w = 1; w < currentWeek; w++) {
			if (scheduleData[w] && scheduleData[w][day]) {
				if (scheduleData[w][day].length > prevMax) {
					prevMax = scheduleData[w][day].length;
				}
			}
		}

		while (scheduleData[currentWeek][day].length < prevMax) {
			scheduleData[currentWeek][day].push(null);
		}
	});

	DAYS.forEach(day => {
		const column = document.createElement('div');
		column.className = 'day-column';

		const header = document.createElement('div');
		header.className = 'day-header';
		header.textContent = day;
		column.appendChild(header);

		scheduleData[currentWeek][day].forEach((assignedTopicName, index) => {
			const slot = document.createElement('div');
			const effective = getEffectiveTopic(currentWeek, day, index);

			// Safety verify structural category bindings inside registry mapping
			const catInfo = database.categories.find(c => c.topics.includes(effective.name));

			if (effective.name && catInfo) {
				const hubRecord = database.topicsHub[effective.name] || { resources: [] };

				let totalPercent = 0;
				if (hubRecord.resources && hubRecord.resources.length > 0) {
					let sumPercentages = 0;
					hubRecord.resources.forEach(res => {
						const current = Number(res.current) || 0;
						const total = Number(res.total) || 1;
						sumPercentages += Math.min(100, Math.max(0, (current / total) * 100));
					});
					totalPercent = Math.round(sumPercentages / hubRecord.resources.length);
				}

				slot.className = 'block-slot assigned';
				if (effective.type === 'inherited') {
					slot.className += ' inherited';
					slot.title = "Automatically recurring tracking template from past weeks";
				}

				slot.style.backgroundColor = catInfo.color;
				slot.innerHTML = `
					<div class="block-category">${catInfo.name} ${effective.type === 'inherited' ? '🔄' : ''}</div>
					<div style="font-weight:600;">${effective.name}</div>
					<div class="progress-container">
						<div class="progress-fill" style="width: ${totalPercent}%"></div>
					</div>
					<div class="progress-text">${totalPercent}% Done</div>
				`;
				slot.onclick = () => openDetailsModal(effective.name, day, index);
			} else {
				// Fallback to empty if catalog items were missing or purged out via configuration admin views
				slot.className = 'block-slot';
				slot.textContent = 'Empty Slot';
				slot.onclick = () => openSelectModal(day, index);
			}
			column.appendChild(slot);
		});

		const addBtn = document.createElement('button');
		addBtn.className = 'add-block-btn';
		addBtn.textContent = '+ Add Slot';
		addBtn.onclick = () => {
			scheduleData[currentWeek][day].push(null);
			saveSchedule();
			renderCalendar();
		};
		column.appendChild(addBtn);
		grid.appendChild(column);
	});
}

function buildSelectionMenu() {
	const container = document.getElementById('modalMenuOptions');
	container.innerHTML = '';

	if(database.categories.length === 0) {
		container.innerHTML = '<p style="color:#64748b; font-style:italic;">No categories created yet. Click \"Manage Topics\" at the top to build your catalog.</p>';
		return;
	}

	database.categories.forEach(cat => {
		const sect = document.createElement('div');
		sect.className = 'menu-category-section';

		const title = document.createElement('div');
		title.className = 'menu-category-title';
		title.style.color = cat.color;
		title.textContent = cat.name;
		sect.appendChild(title);

		const grid = document.createElement('div');
		grid.className = 'menu-grid';

		cat.topics.forEach(tName => {
			const b = document.createElement('button');
			b.className = 'menu-item';
			b.textContent = tName;
			b.onclick = () => selectTopicForSlot(tName);
			grid.appendChild(b);
		});
		sect.appendChild(grid);
		container.appendChild(sect);
	});
}

// 3. Selection Modal Handling
function openSelectModal(day, index) {
	activeTarget = { day, index };

	// Peek at past history to see if there is a valid template that could be restored here
	const restoreContainer = document.getElementById('restoreTemplateContainer');
	const restoreBtn = document.getElementById('restoreTemplateBtn');
	const historicalMatch = getEffectiveTopic(currentWeek - 1, day, index);

	if (historicalMatch.name) {
		restoreContainer.style.display = 'block';
		restoreBtn.onclick = () => {
			scheduleData[currentWeek][day][index] = null;
			saveSchedule();
			renderCalendar();
			closeSelectModal();
		};
	} else {
		restoreContainer.style.display = 'none';
	}

	document.getElementById('selectModal').style.display = 'flex';
}
function closeSelectModal(e) {
	if (!e || e.target === document.getElementById('selectModal') || e.target.tagName === 'BUTTON') {
		document.getElementById('selectModal').style.display = 'none';
	}
}
function selectTopicForSlot(name) {
	scheduleData[currentWeek][activeTarget.day][activeTarget.index] = name;
	saveSchedule();
	renderCalendar();
	closeSelectModal();
}
function deleteEmptySlot() {
	scheduleData[currentWeek][activeTarget.day].splice(activeTarget.index, 1);
	saveSchedule();
	renderCalendar();
	closeSelectModal();
}

// 4. Details / Trackers Sub-Modal Processing Logic
function openDetailsModal(topicName, day, index) {
	activeTarget = { day, index, topicKey: topicName };
	const hubRecord = database.topicsHub[topicName] || { description: "", resources: [] };

	document.getElementById('detailsTitle').textContent = topicName;
	document.getElementById('topicDesc').value = hubRecord.description || "";

	// Customize layout UI text option if it is an inherited slot reference block layout configuration
	const actualSlotValue = (scheduleData[currentWeek] && scheduleData[currentWeek][day]) ? scheduleData[currentWeek][day][index] : null;
	const unassignBtn = document.getElementById('unassignBtn');
	if (actualSlotValue === null) {
		unassignBtn.textContent = "Stop Recurring Here";
	} else {
		unassignBtn.textContent = "Unassign Topic";
	}

	renderResourcesList(hubRecord.resources);
	toggleTypeLabels();
	document.getElementById('detailsModal').style.display = 'flex';
}
function closeDetailsModal(e) {
	if (!e || e.target === document.getElementById('detailsModal') || e.target.tagName === 'BUTTON') {
		document.getElementById('detailsModal').style.display = 'none';
	}
}
function toggleTypeLabels() {
	const type = document.getElementById('newResType').value;
	const currentLbl = document.getElementById('lblCurrent');
	const totalLbl = document.getElementById('lblTotal');
	if (type === 'book') {
		currentLbl.textContent = "Current Page"; totalLbl.textContent = "Total Pages";
	} else if (type === 'video') {
		currentLbl.textContent = "Current Time (Minutes)"; totalLbl.textContent = "Total Length (Minutes)";
	} else if (type === 'site') {
		currentLbl.textContent = "Current Chapters"; totalLbl.textContent = "Total Chapters";
	} else {
		currentLbl.textContent = "Lessons Complete"; totalLbl.textContent = "Total Lessons";
	}
}

function renderResourcesList(resources) {
	const container = document.getElementById('resourcesList');
	container.innerHTML = '';
	if (!resources || resources.length === 0) {
		container.innerHTML = '<p style="color:#64748b; font-style:italic; margin-bottom:1rem;">No resources added yet.</p>';
		return;
	}
	resources.forEach((res, idx) => {
		const card = document.createElement('div');
		card.className = 'resource-card';
		let typeIcon = res.type === 'book' ? '📚' : res.type === 'video' ? '🎥' : res.type === 'site' ? '🌐' : '🎓';
		let unitLabel = res.type === 'book' ? 'pages' : res.type === 'video' ? 'mins' : res.type === 'site' ? 'chapters' : 'lessons';

		const current = Number(res.current) || 0;
		const total = Number(res.total) || 1;
		const resourcePercent = Math.min(100, Math.max(0, Math.round((current / total) * 100)));

		card.innerHTML = `
			<button class="remove-res-btn" onclick="deleteResource(${idx})">🗑️ Delete</button>
			<div class="resource-header"><span>${typeIcon} ${res.title}</span></div>
			<div class="resource-meta">${res.link ? `<a href="${res.link}" target="_blank">Open Link ↗</a>` : 'No link set'}</div>
			<div class="progress-row">
				<span>Progress:</span>
				<input type="number" value="${res.current}" min="0" onchange="updateProgress(${idx}, 'current', this.value)">
				<span>/</span>
				<input type="number" value="${res.total}" min="1" onchange="updateProgress(${idx}, 'total', this.value)">
				<span style="font-size:0.85rem; color:#64748b;">${unitLabel}</span>
			</div>
			<div class="progress-container"><div class="progress-fill" style="width: ${resourcePercent}%"></div></div>
			<div style="font-size: 0.75rem; color: #64748b; margin-top: 0.25rem; text-align: right; font-weight: 600;">${resourcePercent}% Complete</div>
		`;
		container.appendChild(card);
	});
}

function addResource() {
	const title = document.getElementById('newResTitle').value.trim();
	const type = document.getElementById('newResType').value;
	const link = document.getElementById('newResLink').value.trim();
	const current = parseInt(document.getElementById('newResCurrent').value) || 0;
	const total = parseInt(document.getElementById('newResTotal').value) || 100;

	if (!title) return alert("Title required!");

	const tKey = activeTarget.topicKey;
	database.topicsHub[tKey].resources.push({ title, type, link, current, total });
	document.getElementById('newResTitle').value = ""; document.getElementById('newResLink').value = "";

	saveDb();
	renderCalendar();
	renderResourcesList(database.topicsHub[tKey].resources);
}
function updateProgress(resIndex, field, value) {
	const tKey = activeTarget.topicKey;
	database.topicsHub[tKey].resources[resIndex][field] = parseInt(value) || 0;
	saveDb();
	renderCalendar();
	renderResourcesList(database.topicsHub[tKey].resources);
}
function deleteResource(resIndex) {
	const tKey = activeTarget.topicKey;
	database.topicsHub[tKey].resources.splice(resIndex, 1);
	saveDb();
	renderCalendar();
	renderResourcesList(database.topicsHub[tKey].resources);
}
function saveDetailsChanges() {
	const tKey = activeTarget.topicKey;
	database.topicsHub[tKey].description = document.getElementById('topicDesc').value;
	saveDb();
	closeDetailsModal();
}
function clearTopicFromSlot() {
	scheduleData[currentWeek][activeTarget.day][activeTarget.index] = "__EXPLICIT_EMPTY__";
	saveSchedule();
	renderCalendar();
	closeDetailsModal();
}

// 5. Database Admin Catalog Tree Management Controller
function openAdminModal() {
	renderAdminCategoryTree();
	document.getElementById('adminModal').style.display = 'flex';
}
function closeAdminModal(e) {
	if (!e || e.target === document.getElementById('adminModal') || e.target.tagName === 'BUTTON') {
		buildSelectionMenu();
		renderCalendar();
		document.getElementById('adminModal').style.display = 'none';
	}
}

function renderAdminCategoryTree() {
	const container = document.getElementById('adminCategoryTree');
	container.innerHTML = '';

	if(database.categories.length === 0) {
		container.innerHTML = '<p style="color:#64748b; font-style:italic;">Empty catalog.</p>';
		return;
	}

	database.categories.forEach((cat, catIdx) => {
		const card = document.createElement('div');
		card.className = 'admin-category-card';
		card.style.borderLeft = `5px solid ${cat.color}`;

		card.innerHTML = `
			<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
				<strong style="font-size:1.1rem; color:${cat.color}">${cat.name}</strong>
				<button class="danger-btn" style="padding:0.25rem 0.5rem; font-size:0.8rem;" onclick="deleteCategoryAdmin(${catIdx})">Purge Category</button>
			</div>
			<div style="margin-bottom:1rem;" id="topicTagsGroup-${catIdx}"></div>
			<div style="display:flex; gap:0.5rem;">
				<input type="text" id="inputNewTopicName-${catIdx}" placeholder="New topic title (e.g. Debian administration)" style="padding:0.4rem;">
				<button class="primary-btn" style="padding:0.4rem 1rem;" onclick="addTopicToCategoryAdmin(${catIdx})">+ Append Topic</button>
			</div>
		`;
		container.appendChild(card);

		const tagsContainer = document.getElementById(`topicTagsGroup-${catIdx}`);
		cat.topics.forEach((tName, tIdx) => {
			const tag = document.createElement('span');
			tag.className = 'admin-topic-tag';
			tag.innerHTML = `${tName} <button onclick="deleteTopicFromCategoryAdmin(${catIdx}, ${tIdx}, '${tName}')">✕</button>`;
			tagsContainer.appendChild(tag);
		});
	});
}

function addCategoryAdmin() {
	const name = document.getElementById('adminNewCatName').value.trim();
	const color = document.getElementById('adminNewCatColor').value;
	if(!name) return alert("Category name cannot be blank!");

	const id = 'cat_' + Date.now();
	database.categories.push({ id, name, color, topics: [] });
	document.getElementById('adminNewCatName').value = '';
	saveDb();
	renderAdminCategoryTree();
}

function deleteCategoryAdmin(index) {
	if(!confirm("Are you sure? This will remove this category grouping from the database.")) return;
	database.categories.splice(index, 1);
	saveDb();
	renderAdminCategoryTree();
}

function addTopicToCategoryAdmin(catIndex) {
	const input = document.getElementById(`inputNewTopicName-${catIndex}`);
	const tName = input.value.trim();
	if(!tName) return alert("Topic title cannot be empty!");

	// Prevent global naming duplicates across relational memory tables
	if(database.topicsHub[tName] || database.categories.some(c => c.topics.includes(tName))) {
		return alert("A topic with this title already exists inside your catalog tracking profile!");
	}

	database.categories[catIndex].topics.push(tName);
	database.topicsHub[tName] = { description: "", resources: [] };

	input.value = '';
	saveDb();
	renderAdminCategoryTree();
}

function deleteTopicFromCategoryAdmin(catIndex, topicIndex, topicName) {
	if(!confirm(`Delete topic "${topicName}"? Content records inside the tracking metrics hub will be permanently wiped.`)) return;

	database.categories[catIndex].topics.splice(topicIndex, 1);
	delete database.topicsHub[topicName];

	saveDb();
	renderAdminCategoryTree();
}

// 6. External Backup Input/Output Engines
function exportDataJSON() {
	const packet = { database, scheduleData };
	const blob = new Blob([JSON.stringify(packet, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `study_planner_backup_${new Date().toISOString().slice(0,10)}.json`;
	a.click();
	URL.revokeObjectURL(url);
}

function importDataJSON(event) {
	const file = event.target.files[0];
	if (!file) return;
	const reader = new FileReader();
	reader.onload = function(e) {
		try {
			const parsed = JSON.parse(e.target.result);
			if (parsed.database && parsed.scheduleData) {
				database = parsed.database;
				scheduleData = parsed.scheduleData;
				saveDb();
				saveSchedule();

				// On manual backup import, determine the lowest active configured week item dynamically
				currentWeek = findFirstConfiguredWeek();
				localStorage.setItem('study_planner_last_week_v3', currentWeek);

				renderCalendar();
				buildSelectionMenu();
				alert("Backup file successfully loaded!");
			} else {
				alert("Invalid data structure detected inside uploaded backup file.");
			}
		} catch(err) {
			alert("Failed to parse file. Ensure it is a valid JSON database file export.");
		}
	};
	reader.readAsText(file);
}

function changeWeek(dir) {
	currentWeek += dir;
	if (currentWeek < 1) currentWeek = 1;
	localStorage.setItem('study_planner_last_week_v3', currentWeek);
	renderCalendar();
}

function goToFirstWeek() {
	currentWeek = 1;
	localStorage.setItem('study_planner_last_week_v3', currentWeek);
	renderCalendar();
}

// Navigates to the furthest week between your actual current calendar week and your last manual data entry
function goToLastWeek() {
	// 1. Calculate the real-world current week based on the baseline date
	const now = new Date();
	const msPerWeek = 7 * 24 * 60 * 60 * 1000;
	const weeksElapsed = Math.floor((now.getTime() - BASELINE_DATE.getTime()) / msPerWeek);
	const realWorldCurrentWeek = Math.max(1, weeksElapsed + 1);

	// 2. Find the highest week number with explicit manual data entries
	let keys = Object.keys(scheduleData).map(Number).filter(k => !isNaN(k));
	let latestWithManualData = 1;

	keys.forEach(w => {
		let hasData = false;
		if (scheduleData[w]) {
			Object.keys(scheduleData[w]).forEach(day => {
				if (Array.isArray(scheduleData[w][day])) {
					scheduleData[w][day].forEach(slot => {
						if (slot !== null && slot !== "__EXPLICIT_EMPTY__") {
							hasData = true;
						}
					});
				}
			});
		}
		if (hasData && w > latestWithManualData) {
			latestWithManualData = w;
		}
	});

	// 3. Compare both and pick the absolute maximum
	let targetWeek = Math.max(realWorldCurrentWeek, latestWithManualData);

	// 4. Update the state, save the session, and refresh the UI view
	currentWeek = targetWeek;
	localStorage.setItem('study_planner_last_week_v3', currentWeek);
	renderCalendar();
}

// Resets the planner back to a clean state and purges local storage profiles
function clearData() {
	if (!confirm("Are you sure you want to reset everything? This will permanently delete all custom categories, topics, progress logs, and scheduled weeks.")) {
		return;
	}

	// 1. Reset relational repositories back to initial baseline empty states
	database = { categories: [], topicsHub: {} };
	scheduleData = {};
	currentWeek = 1;
	activeTarget = { day: null, index: null, topicKey: null };

	// 2. Wipe specific storage keys from the browser memory
	localStorage.removeItem('study_planner_db_v3');
	localStorage.removeItem('study_planner_schedule_v3');
	localStorage.removeItem('study_planner_last_week_v3');

	// Save defaults to storage so the clean state persists immediately
	saveDb();
	saveSchedule();

	// 4. Force a complete re-render of layout structures and modal items
	renderCalendar();
	buildSelectionMenu();

	alert("Planner database successfully reset!");
}

function saveSchedule() { localStorage.setItem('study_planner_schedule_v3', JSON.stringify(scheduleData)); }
function saveDb() { localStorage.setItem('study_planner_db_v3', JSON.stringify(database)); }

init();
