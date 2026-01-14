// client/analysis.js
import {port_url} from "./port.js"
// Store Global State
let currentData = null;
let activeTaskId = null;
let activeFloor = 'FF';

async function initAnalysis() {
    const urlParams = new URLSearchParams(window.location.search);
    // Priority: URL Param > LocalStorage > Error
    activeTaskId = urlParams.get('taskId') || localStorage.getItem('currentTaskId');
    activeFloor = urlParams.get('floor') || 'FF'; // Default starter floor

    if (!activeTaskId) {
        document.querySelector('.container').innerHTML = `
            <div style="text-align:center; padding:50px;">
                <h3>No Structure Found</h3>
                <p>Please return to the <a href="index.html" style="color:var(--accent-color);">Drafting Board</a> and click "Generate" to create a structure first.</p>
            </div>`;
        return;
    }

    // Load Initial Floor
    await loadFloor(activeFloor);

    // Setup Save
    const saveBtn = document.getElementById('btn-save-analysis');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            // 1. Gather current state (Frontend "Truth")
            // If user edited Slabs in frontend (e.g. changing type to 'One-way' manually), we must capture it.
            // Currently frontend doesn't edit slab props deeply, but we prepare for it.

            // For now, we trust the Backend's last known state + any manual overrides.
            // But optimal sync: Frontend sends current structure to backend to SAVE.
            await saveAnalysis(activeTaskId, activeFloor);
        });
    }

    // Setup Report
    const reportBtn = document.getElementById('btn-report');
    if (reportBtn) {
        reportBtn.addEventListener('click', async () => {
            // 1. Save Analysis Snapshot (captures current UI state)
            await saveAnalysisSnapshot(activeTaskId, activeFloor);
            // 2. Force Save structural changes
           
            // 3. Open Report
            window.open(`report.html?taskId=${activeTaskId}&floor=${activeFloor}`, '_blank');
        });
    }
}

// NEW: Save Analysis Snapshot
async function saveAnalysisSnapshot(taskId, floorId) {
    if (!currentData) return;

    try {
        // Capture COMPLETE state including any UI modifications
        const snapshot = {
            taskId: taskId,
            floor: floorId,
            scale: currentData.scale,
            grid: currentData.grid,
            columns: currentData.columns || [],
            beams: currentData.beams || [],
            slabs: currentData.slabs || [],
            stairs: currentData.stairs || [],
            walls: currentData.walls || [],
            settings: {
                slabThickness: parseFloat(document.getElementById('set-slab-thick').value),
                finishLoad: parseFloat(document.getElementById('set-finish').value),
                liveLoad: parseFloat(document.getElementById('set-live').value),
                density: parseFloat(document.getElementById('set-density').value),
                beamWidth: parseFloat(document.getElementById('set-beam-w').value),
                beamDepth: parseFloat(document.getElementById('set-beam-d').value),
                fcu: parseFloat(document.getElementById('set-fcu').value),
                fy: parseFloat(document.getElementById('set-fy').value),
                fyv: parseFloat(document.getElementById('set-fyv').value),
                cover: parseFloat(document.getElementById('set-cover').value)
            }
        };

        const res = await fetch(`${port_url}/api/analyze/save-snapshot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId, floor: floorId, snapshot })
        });

        if (!res.ok) {
            console.error('Failed to save analysis snapshot');
        } else {
            console.log('✅ Analysis snapshot saved successfully');
        }
    } catch (e) {
        console.error('Snapshot save error:', e);
    }
}

async function loadFloor(floorId) {
    activeFloor = floorId;

    // Update Title & Buttons
    document.getElementById('task-display').innerText = `${activeTaskId}`;

    document.querySelectorAll('.floor-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.getElementById(`btn-show-${floorId.toLowerCase()}`);
    if (activeBtn) activeBtn.classList.add('active');

    try {
        // Fetch JSON
        const res = await fetch(`http://localhost:3000/tasks/${activeTaskId}/${floorId}.json`);
        if (!res.ok) throw new Error(`Could not fetch data for ${floorId}`);
        currentData = await res.json();

        // Populate Settings from currentData if available
        if (currentData.settings) {
            if (document.getElementById('set-slab-thick')) document.getElementById('set-slab-thick').value = currentData.settings.slabThickness || 0.15;
            if (document.getElementById('set-finish')) document.getElementById('set-finish').value = currentData.settings.finishLoad || 1.5;
            if (document.getElementById('set-live')) document.getElementById('set-live').value = currentData.settings.liveLoad || 1.5;
            if (document.getElementById('set-density')) document.getElementById('set-density').value = currentData.settings.density || 24;
            if (document.getElementById('set-beam-w')) document.getElementById('set-beam-w').value = currentData.settings.beamWidth || 0.23;
            if (document.getElementById('set-beam-d')) document.getElementById('set-beam-d').value = currentData.settings.beamDepth || 0.45;
            if (document.getElementById('set-fcu')) document.getElementById('set-fcu').value = currentData.settings.fcu || 25;
            if (document.getElementById('set-fy')) document.getElementById('set-fy').value = currentData.settings.fy || 460;
            if (document.getElementById('set-fyv')) document.getElementById('set-fyv').value = currentData.settings.fyv || 250;
            if (document.getElementById('set-cover')) document.getElementById('set-cover').value = currentData.settings.cover || 25;
        }

        renderAnalysis(currentData);

    } catch (e) {
        console.error(e);
        // If file missing (e.g. GF not generated), clear table and show warning
        document.querySelector('#beam-table tbody').innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:#aaa;">No data found for ${floorId}</td></tr>`;
        document.querySelector('#slab-table tbody').innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:#aaa;">No data found for ${floorId}</td></tr>`;
        updateSummaries([], []);
    }
}

window.switchFloor = (floorId) => {
    loadFloor(floorId);
};

function renderAnalysis(data) {
    const beams = data.beams || [];
    const slabs = data.slabs || [];
    const grid = data.grid || { xLines: [], yLines: [] };

    updateSummaries(beams, slabs);

    // --- BEAM TABLE ---
    const beamTbody = document.querySelector('#beam-table tbody');
    beamTbody.innerHTML = '';

    beams.sort((a, b) => { // Sort Primary first, then ID
        if (a.type !== b.type) return a.type === 'Primary' ? -1 : 1;
        return a.id.localeCompare(b.id, undefined, { numeric: true });
    });

    beams.forEach((b, idx) => {
        const length = Math.hypot(b.x2 - b.x1, b.y2 - b.y1).toFixed(2);
        const startGrid = findGridRef(b.x1, b.y1, grid);
        const endGrid = findGridRef(b.x2, b.y2, grid);

        const tr = document.createElement('tr');
        tr.dataset.idx = idx; // Link to array index
        tr.innerHTML = `
            <td><input class="tbl-input" type="text" data-field="id" value="${b.id}" onchange="updateBeamData(${idx}, 'id', this.value)"></td>
            <td>
                <select class="tbl-input" onchange="updateBeamData(${idx}, 'type', this.value)">
                    <option value="Primary" ${b.type === 'Primary' ? 'selected' : ''}>Primary</option>
                    <option value="Secondary" ${b.type === 'Secondary' ? 'selected' : ''}>Secondary</option>
                    <option value="Hidden" ${b.type === 'Hidden' ? 'selected' : ''}>Hidden</option>
                </select>
            </td>
            <td><input class="tbl-input" type="number" step="0.01" value="${length}" onchange="updateBeamLength(${idx}, this.value)"></td>
            <td>${startGrid} → ${endGrid}</td>
            <td style="color:#888; font-size:0.9em;">(Grid Ref)</td>
        `;
        beamTbody.appendChild(tr);
    });

    // --- SLAB TABLE ---
    const slabTbody = document.querySelector('#slab-table tbody');
    slabTbody.innerHTML = '';

    slabs.forEach((s, idx) => {
        const area = (s.width * s.height).toFixed(2);
        const ratio = (Math.max(s.width, s.height) / Math.min(s.width, s.height)).toFixed(2);
        const type = ratio > 2 ? "One-way" : "Two-way";

        const tr = document.createElement('tr');
        tr.dataset.idx = idx;
        tr.innerHTML = `
            <td><input class="tbl-input" type="text" value="${s.id}" onchange="updateSlabData(${idx}, 'id', this.value)"></td>
            <td>
                <div style="display:flex; gap:5px; align-items:center;">
                    W: <input class="tbl-input" type="number" step="0.1" value="${s.width.toFixed(2)}" style="width:70px" onchange="updateSlabDim(${idx}, 'width', this.value)">
                    H: <input class="tbl-input" type="number" step="0.1" value="${s.height.toFixed(2)}" style="width:70px" onchange="updateSlabDim(${idx}, 'height', this.value)">
                </div>
            </td>
            <td>${area}</td>
            <td>${type} <span style="font-size:0.8em; color:#666;">(Ratio: ${ratio})</span></td>
            <td>-</td>
        `;
        slabTbody.appendChild(tr);
    });
}

// --- UPDATE HANDLERS ---

window.updateBeamData = (idx, field, val) => {
    if (currentData && currentData.beams[idx]) {
        currentData.beams[idx][field] = val;
    }
};

window.updateBeamLength = (idx, newLenStr) => {
    if (!currentData || !currentData.beams[idx]) return;
    const b = currentData.beams[idx];
    const newLen = parseFloat(newLenStr);
    const oldLen = Math.hypot(b.x2 - b.x1, b.y2 - b.y1);

    if (newLen > 0 && oldLen > 0) {
        // Extend along vector from P1
        const ratio = newLen / oldLen;
        b.x2 = b.x1 + (b.x2 - b.x1) * ratio;
        b.y2 = b.y1 + (b.y2 - b.y1) * ratio;
        console.log(`Beam ${b.id} resized from ${oldLen.toFixed(2)} to ${newLen.toFixed(2)}`);
    }
};

window.updateSlabData = (idx, field, val) => {
    if (currentData && currentData.slabs[idx]) {
        currentData.slabs[idx][field] = val;
    }
};

window.updateSlabDim = (idx, dim, val) => {
    if (!currentData || !currentData.slabs[idx]) return;
    const valNum = parseFloat(val);
    if (valNum > 0) {
        currentData.slabs[idx][dim] = valNum;
        // Optionally update UI area calc immediately
    }
};

// --- SAVE FUNCTION ---

async function saveAnalysis(taskId, floorId) {
    if (!currentData) return;

    try {
        const payload = {
            taskId: taskId,
            floor: floorId,
            structure: {
                columns: currentData.columns || [],
                beams: currentData.beams,
                slabs: currentData.slabs,
                settings: {
                    slabThickness: parseFloat(document.getElementById('set-slab-thick').value),
                    finishLoad: parseFloat(document.getElementById('set-finish').value),
                    liveLoad: parseFloat(document.getElementById('set-live').value),
                    density: parseFloat(document.getElementById('set-density').value),
                    beamWidth: parseFloat(document.getElementById('set-beam-w').value),
                    beamDepth: parseFloat(document.getElementById('set-beam-d').value),
                    fcu: parseFloat(document.getElementById('set-fcu').value),
                    fy: parseFloat(document.getElementById('set-fy').value),
                    fyv: parseFloat(document.getElementById('set-fyv').value),
                    cover: parseFloat(document.getElementById('set-cover').value)
                }
            }
        };

        const res = await fetch(`${port_url}/api/analyze/update`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            alert('Analysis Data Saved Successfully! Drafting view will reflect these changes.');
            location.reload(); // Refresh to re-render tables cleanly
        } else {
            alert('Failed to save analysis data.');
        }
    } catch (e) {
        console.error(e);
        alert('Error saving data: ' + e.message);
    }
}

function updateSummaries(beams, slabs) {
    document.getElementById('total-beams').innerText = beams.length;
    document.getElementById('total-slabs').innerText = slabs.length;
    const totalArea = slabs.reduce((acc, s) => acc + (s.width * s.height), 0);
    document.getElementById('total-area').innerText = totalArea.toFixed(2) + " m²";
}

// Utility: Find nearest Grid Intersection label
function findGridRef(x, y, grid) {
    if (!grid || !grid.xLines || !grid.yLines) return "??";
    let bestX = grid.xLines[0], minDistX = 999;
    grid.xLines.forEach(l => { const d = Math.abs(l.val - x); if (d < minDistX) { minDistX = d; bestX = l; } });
    let bestY = grid.yLines[0], minDistY = 999;
    grid.yLines.forEach(l => { const d = Math.abs(l.val - y); if (d < minDistY) { minDistY = d; bestY = l; } });
    return `${bestX.label}-${bestY.label}`;
}

// Start
initAnalysis();
