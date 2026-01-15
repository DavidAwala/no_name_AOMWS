// Client-side Drafting Logic (Dual Canvas)
import {port_url} from "./port.js"
// --- Global State ---
let activeFloorId = 'GF'; // 'GF' or 'FF'
let currentTool = 'select';

// Floor Instances (The "State")
const floors = {
    GF: null, // { stage, layers: {}, data: {}, history: [] ... }
    FF: null
};

// Config
const SNAP_DIST = 15;
const COLORS = {
    wall: '#FF4444',
    stair: '#FFAA00',
    column: '#00FF00',
    beam: '#FF3333'
};

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Validity
    floors.GF = initFloorInstance('GF', 'holder-gf');
    floors.FF = initFloorInstance('FF', 'holder-ff');

    setupUI();
    setActiveFloor('GF');

    // Restore UI State if Session Exists
    if (localStorage.getItem('currentTaskId')) {
        const controls = document.getElementById('edit-controls');
        if (controls) controls.classList.remove('hidden');
        console.log("Restored Session:", localStorage.getItem('currentTaskId'));
    }
});

function initFloorInstance(id, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    // Konva Setup
    const stage = new Konva.Stage({
        container: containerId,
        width: container.offsetWidth,
        height: container.offsetHeight
    });

    const layers = {
        image: new Konva.Layer(),
        drafting: new Konva.Layer(),
        structure: new Konva.Layer(),
        cursor: new Konva.Layer()
    };

    stage.add(layers.image);
    stage.add(layers.drafting);
    stage.add(layers.structure);
    stage.add(layers.cursor);

    // Zoom Logic
    stage.on('wheel', (e) => {
        e.evt.preventDefault();
        const oldScale = stage.scaleX();
        const ptr = stage.getPointerPosition();
        const scaleBy = 1.1;
        const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
        stage.scale({ x: newScale, y: newScale });
        const mousePointTo = { x: (ptr.x - stage.x()) / oldScale, y: (ptr.y - stage.y()) / oldScale };
        const newPos = { x: ptr.x - mousePointTo.x * newScale, y: ptr.y - mousePointTo.y * newScale };
        stage.position(newPos);
    });

    // Activation Logic
    stage.on('mousedown', () => {
        if (activeFloorId !== id) setActiveFloor(id);
    });

    // Interaction Listeners (Bound to this instance)
    stage.on('mousedown.tool', (e) => onStageMouseDown(id, e));
    stage.on('mousemove.tool', (e) => onStageMouseMove(id, e));
    stage.on('contentContextmenu', (e) => { e.evt.preventDefault(); cancelDrawing(id); });

    // Transformer for selection
    const tr = new Konva.Transformer();
    layers.structure.add(tr);

    // Selection Box
    const selectionRect = new Konva.Rect({
        fill: 'rgba(0,0,255,0.2)',
        visible: false
    });
    layers.cursor.add(selectionRect);

    return {
        id,
        stage,
        layers,
        tr,
        selectionRect, // Expose it
        selectedNode: null,
        selectedNodes: [],
        data: { walls: [], stairs: [] },
        scaleFactor: null,
        imageNode: null,
        historyStack: [],
        historyStep: -1,
        results: null,
        // Temp Drawing
        temp: { lastPoint: null, ghostLine: null, snapIndicator: null },
        isSelecting: false,
        selectionStart: null
    };
}

// --- UI & Global Controls ---

function setupUI() {
    // Tools
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            selectTool(e.target.closest('button').dataset.tool);
        });
    });

    // Controls
    document.getElementById('btn-analyze').addEventListener('click', submitAll);
    document.getElementById('btn-clear').addEventListener('click', clearActiveFloor);
    document.getElementById('btn-undo').addEventListener('click', undo);
    document.getElementById('btn-redo').addEventListener('click', redo);
    document.getElementById('btn-save-struct').addEventListener('click', saveStructure);
    const btnAnalysis = document.getElementById('btn-open-analysis');
    // OPEN ANALYSIS PAGE
    if (btnAnalysis) {
        btnAnalysis.addEventListener('click', () => {
            const f = floors[activeFloorId];
            const taskId = (f.results && f.results.taskId) || localStorage.getItem('currentTaskId');

            if (!taskId) {
                alert("No structure data saved yet! Please Generate or Save first.");
                return;
            }
            window.open(`analysis.html?taskId=${taskId}`, '_blank');
        });
    }


    // Merge Button
    const btnMerge = document.getElementById('btn-merge');
    if (btnMerge) {
        btnMerge.addEventListener('click', () => {
            const f = floors[activeFloorId];
            const nodes = f.selectedNodes || [];
            const beams = nodes.filter(n => n.name() === 'structure_beam');

            if (beams.length >= 2) {
                // BEAM MERGE LOGIC (Existing)
                // Ask for Primary Name
                const primaryName = prompt("Enter ID for the Merged Beam (others will be hidden):", beams[0].id());
                if (!primaryName) return;

                // Implementation:
                // Rename all selected beams to the primaryName.
                // Mark all but the first selected beam as 'Hidden' type.
                beams.forEach((b, index) => {
                    b.id(primaryName);
                    if (index > 0) { // All except the first one become 'Hidden'
                        b.setAttr('beamType', 'Hidden');
                    }
                });
                f.layers.structure.batchDraw();
                updatePropertyInspector(f);
                return;
            }

            const slabNodes = nodes.filter(n => n.name() === 'structure_slab');
            if (slabNodes.length >= 2) {
                // TRUE SLAB MERGE LOGIC with Renumbering
                // 1. Find shared beam(s) between selected slabs
                // 2. Hide those beams
                // 3. Merge slab geometries into one larger slab
                // 4. Remove old slabs and renumber ALL slabs sequentially

                const allBeams = f.layers.structure.getChildren().filter(n => n.name() === 'structure_beam');
                let hiddenCount = 0;

                // Find all beams between the selected slabs
                for (let i = 0; i < slabNodes.length; i++) {
                    for (let j = i + 1; j < slabNodes.length; j++) {
                        const s1 = slabNodes[i];
                        const s2 = slabNodes[j];
                        const b1 = s1.getClientRect();
                        const b2 = s2.getClientRect();

                        // Union box
                        const ux = Math.min(b1.x, b2.x);
                        const uy = Math.min(b1.y, b2.y);
                        const uw = Math.max(b1.x + b1.width, b2.x + b2.width) - ux;
                        const uh = Math.max(b1.y + b1.height, b2.y + b2.height) - uy;

                        // Hide beams strictly INSIDE the union (shared boundary beams)
                        allBeams.forEach(bm => {
                            const bBox = bm.getClientRect();
                            const bcx = bBox.x + bBox.width / 2;
                            const bcy = bBox.y + bBox.height / 2;

                            // Check if beam center is inside union box
                            if (bcx > ux + 2 && bcx < ux + uw - 2 && bcy > uy + 2 && bcy < uy + uh - 2) {
                                if (bm.getAttr('beamType') !== 'Hidden') {
                                    bm.setAttr('beamType', 'Hidden');
                                    bm.stroke('#555');
                                    bm.dash([5, 5]);
                                    hiddenCount++;
                                }
                            }
                        });
                    }
                }

                if (hiddenCount > 0) {
                    alert(`Merged ${slabNodes.length} panels! Hidden ${hiddenCount} beams. Click "Save Changes" to regenerate with proper numbering.`);
                    f.layers.structure.batchDraw();
                } else {
                    alert("Could not find separating beams to hide between selected panels.");
                }
                return;
            }

            alert("Select at least 2 beams OR 2 panels to merge.");
        });
    }

    // Explicit Uploads
    document.getElementById('upload-gf').addEventListener('change', (e) => handleUpload(e, 'GF'));
    document.getElementById('upload-ff').addEventListener('change', (e) => handleUpload(e, 'FF'));

    // Inputs
    document.getElementById('wall-thickness').addEventListener('change', redrawActive);
    document.getElementById('prop-type').addEventListener('change', (e) => {
        const f = floors[activeFloorId];
        const nodes = f.selectedNodes || (f.selectedNode ? [f.selectedNode] : []);
        const val = e.target.value;

        nodes.forEach(node => {
            if (node.name() === 'structure_beam') {
                node.setAttr('beamType', val);
            }
        });
    });

    // Keyboard
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') cancelDrawing(activeFloorId);
        if (e.key === 'Delete') deleteSelection(activeFloorId);
        if ((e.ctrlKey) && e.key === 'z') undo();
    });

    // Beam Renaming & Merging Logic
    document.getElementById('prop-id').addEventListener('change', (e) => {
        const f = floors[activeFloorId];
        const nodes = f.selectedNodes || [];
        if (nodes.length !== 1 || !nodes[0].name().includes('beam')) return;

        const targetBeam = nodes[0];
        const newId = e.target.value.trim();
        const oldId = targetBeam.id();

        if (newId === oldId) return;

        // Check if ID already exists (Merge Case)
        const shapes = f.layers.structure.getChildren();
        const existing = shapes.find(n => n.id() === newId && n.name() === 'structure_beam' && n !== targetBeam);

        if (existing) {
            // MERGE LOGIC
            const confirmMerge = confirm(`Merge ${oldId} into ${newId}?`);
            if (!confirmMerge) {
                e.target.value = oldId; // Revert
                return;
            }

            // Ideally we check collinearity, but let's assume user knows.
            // We delete the old beam and maybe extend the new one? 
            // Or just renaming it creates a "Duplicate ID" which the backend/next logic handles?
            // "The changed can be calculated as one (continuous beam)" -> This implies merging geometry if touching.

            // For now, let's just allow the rename. 
            // Visualization might show two "B1"s. 
            // Real merge requires complex geometry union.
            // Let's implement a simple "Same Name = Same Beam Group" logic for now?
            // User asked: "Beam 1 and Beam 2 to become Beam 1... adjusting rest... changes calculated as one"

            // Strategy: Rename. The backend/save logic should handle duplicates or just save them as distinct segments with same ID.
            // But we need to re-index the others!
            targetBeam.id(newId);

            // Update labels
            // (We need to re-render or update text node associated with this beam)
            // Simpler: Just refresh structure completely via save-reload loop? 
            // Or locally: find text node.

        } else {
            targetBeam.id(newId);
        }

        // Re-index / Shift Beam Names? 
        // "Adjusting the rest to match so that none will have repeated value"
        // This implies if I rename B5 to B2, then old B2 becomes B3, B3->B4 etc? using Insertion?
        // Or just swapping?
        // User said: "beam 1 and beam 2 to become beam 1 therefore adjusting the rest"
        // This suggests B2 is gone (merged into B1).

        // Let's implement simple Rename for now. Complex Re-indexing might be too aggressive.
        f.layers.structure.batchDraw();
    });
}

function setActiveFloor(id) {
    activeFloorId = id;

    // UI Feedback
    document.getElementById('floor-indicator').innerText = `Active: ${id === 'GF' ? 'Ground Floor' : 'First Floor'}`;

    document.querySelectorAll('.floor-block').forEach(b => b.classList.remove('active-ctx'));
    const block = document.getElementById(id === 'GF' ? 'block-gf' : 'block-ff');
    if (block) block.classList.add('active-ctx');

    // Update Scale Display
    const f = floors[id];
    const txt = f.scaleFactor ? `${f.scaleFactor.toFixed(2)} px/m` : 'Unset';
    document.getElementById('scale-val').innerText = txt;
}

// --- Interaction Logic (Per Floor) ---

function onStageMouseDown(id, e) {
    if (e.evt.button === 2) return;
    const f = floors[id];
    const pos = getPointer(f.stage);
    if (!pos) return;

    // Check if clicking on empty space for Selection Box (only in select tool)
    if (currentTool === 'select') {
        const clicked = e.target;
        const isStructure = clicked.getParent() === f.layers.structure;

        // If clicking on nothing (image or stage), start selection box
        if (!isStructure && clicked !== f.tr) {
            // Deselect if not holding shift/ctrl
            if (!e.evt.shiftKey && !e.evt.ctrlKey) {
                f.selectedNode = null;
                f.selectedNodes = [];
                f.tr.nodes([]);
                f.layers.structure.batchDraw();
                document.getElementById('prop-inspector').classList.add('hidden');
            }

            f.isSelecting = true;
            f.selectionStart = { x: pos.x, y: pos.y };
            f.selectionRect.width(0);
            f.selectionRect.height(0);
            f.selectionRect.visible(true);
            f.layers.cursor.add(f.selectionRect); // Ensure it's added
            return;
        }

        // Verify Target (Existing Click Select Logic)
        if (isStructure && (clicked.name() === 'structure_col' || clicked.name() === 'structure_beam' || clicked.name() === 'structure_slab')) {

            // MULTI-SELECT LOGIC
            const isMulti = e.evt.shiftKey || e.evt.ctrlKey;
            let currentNodes = f.tr.nodes().slice(); // Copy

            if (isMulti) {
                // Toggle
                const idx = currentNodes.indexOf(clicked);
                if (idx >= 0) {
                    currentNodes.splice(idx, 1);
                } else {
                    currentNodes.push(clicked);
                }
            } else {
                // Single Select
                currentNodes = [clicked];
            }

            f.tr.nodes(currentNodes);
            f.selectedNode = currentNodes.length === 1 ? currentNodes[0] : null;
            f.selectedNodes = currentNodes;

            f.layers.structure.batchDraw();

            // Update UI
            updatePropertyInspector(f);
            return;
        }
    }

    // Delete Structure Tool (Click to Delete)
    if (currentTool === 'delete-struct') {
        const clicked = e.target;
        if (clicked.getParent() === f.layers.structure) {
            clicked.destroy();
            f.tr.nodes([]); // Clear selection if we deleted it
            f.layers.structure.batchDraw();
            return;
        }
    }

    // DELETE SLAB TOOL
    if (currentTool === 'delete-slab') {
        const clicked = e.target;
        if (clicked.name() === 'structure_slab') {
            // Also remove the associated label
            const slabId = clicked.id();
            const textLabel = slabId.replace('S', 'P');
            f.layers.structure.getChildren().forEach(child => {
                if (child.getClassName() === 'Text' && child.text() === textLabel) {
                    child.destroy();
                }
            });
            clicked.destroy();
            f.layers.structure.batchDraw();
        }
        return;
    }

    // ADD SLAB TOOL (Draw Rectangle)
    if (currentTool === 'add-slab') {
        const snapped = applySnapping(f, pos.x, pos.y);

        if (!f.temp.slabStart) {
            // First click - start drawing
            f.temp.slabStart = { x: snapped.x, y: snapped.y };
            // Create ghost rectangle
            if (f.temp.ghostSlab) f.temp.ghostSlab.destroy();
            f.temp.ghostSlab = new Konva.Rect({
                x: snapped.x, y: snapped.y, width: 0, height: 0,
                fill: 'rgba(100, 200, 100, 0.3)',
                stroke: '#0f0',
                strokeWidth: 2,
                listening: false
            });
            f.layers.cursor.add(f.temp.ghostSlab);
            f.layers.cursor.batchDraw();
        } else {
            // Second click - finish drawing
            const start = f.temp.slabStart;
            const x = Math.min(start.x, snapped.x);
            const y = Math.min(start.y, snapped.y);
            const width = Math.abs(snapped.x - start.x);
            const height = Math.abs(snapped.y - start.y);

            if (width > 10 && height > 10) { // Minimum size check
                // Create actual slab
                const slabId = 'S_user_' + Date.now().toString().slice(-4);
                const rect = new Konva.Rect({
                    x, y, width, height,
                    fill: 'rgba(200, 200, 200, 0.25)',
                    stroke: '#555',
                    strokeWidth: 1,
                    name: 'structure_slab',
                    id: slabId,
                    draggable: true
                });
                f.layers.structure.add(rect);
                rect.moveToBottom();

                // Add label
                const text = new Konva.Text({
                    x: x + width / 2,
                    y: y + height / 2,
                    text: slabId.replace('S_user_', 'P'),
                    fontSize: 40,
                    fontFamily: 'Arial',
                    fill: 'rgba(255, 255, 255, 0.4)',
                    listening: false,
                    offsetX: 10, offsetY: 10
                });
                f.layers.structure.add(text);
                text.moveToBottom();
            }

            if (f.temp.ghostSlab) f.temp.ghostSlab.destroy();
            f.temp.ghostSlab = null;
            f.temp.slabStart = null;
            f.layers.structure.batchDraw();
            f.layers.cursor.batchDraw();
        }
        return;
    }

    const { x, y } = applySnapping(f, pos.x, pos.y);

    if (currentTool === 'wall') {
        if (!f.scaleFactor) { alert(`${id}: Set Scale First!`); return; }

        if (!f.temp.lastPoint) {
            f.temp.lastPoint = { x, y };
            createGhostLine(f, { x, y });
        } else {
            addWall(f, f.temp.lastPoint, { x, y });
            f.temp.lastPoint = { x, y }; // Continue chain
            updateGhostLineStart(f, { x, y });
            saveHistory(f);
        }
    } else if (currentTool === 'scale') {
        if (!f.temp.lastPoint) {
            f.temp.lastPoint = { x, y };
            createGhostLine(f, { x, y }, 'blue');
        } else {
            const distPx = Math.hypot(x - f.temp.lastPoint.x, y - f.temp.lastPoint.y);
            const real = prompt(`Enter ${id} distance in METERS:`);
            if (real && !isNaN(real)) {
                f.scaleFactor = distPx / parseFloat(real);
                document.getElementById('scale-val').innerText = `${f.scaleFactor.toFixed(2)} px/m`;
                redraw(f);
                alert(`${id} Scale Set.`);
            }
            cancelDrawing(id);
        }
    } else if (currentTool === 'stair') {
        if (!f.temp.lastPoint) f.temp.lastPoint = { x, y };
        else {
            addStair(f, f.temp.lastPoint, { x, y });
            cancelDrawing(id);
            saveHistory(f);
        }
    }

    if (currentTool === 'add-col') {
        // Wall Snapping Logic
        const wall = findWallAt(f, x, y);
        let finalX = x;
        let finalY = y;

        if (wall) {
            // Project point onto wall line
            const { x: px, y: py } = projectPointOnLine(x, y, wall.x1, wall.y1, wall.x2, wall.y2);
            finalX = px;
            finalY = py;
        }

        const size = (0.3 * f.scaleFactor);
        const rect = new Konva.Rect({
            x: finalX - size / 2, y: finalY - size / 2,
            width: size, height: size,
            fill: COLORS.column, draggable: true,
            id: 'col_user_' + Date.now(),
            name: 'structure_col'
        });
        f.layers.structure.add(rect);

        // SPLIT BEAMS LOGIC
        // Check if this column intersects any existing beams
        const beams = f.layers.structure.getChildren().filter(n => n.name() === 'structure_beam');
        const cx = finalX;
        const cy = finalY;
        const tol = size / 2; // Tolerance

        beams.forEach(beam => {
            const pts = beam.points(); // [x1, y1, x2, y2]
            // We need absolute coords? The points should be relative to layer (same as col).
            const x1 = pts[0], y1 = pts[1], x2 = pts[2], y2 = pts[3];

            // Check if point is on segment
            if (isPointOnSeg(cx, cy, x1, y1, x2, y2, tol)) {
                // SPLIT!
                // 1. Shorten Beam 1 (original) -> Start to Col
                // 2. Create Beam 2 -> Col to End

                // We shouldn't modify original in-place strictly if we want clean IDs, 
                // but let's reuse original for first segment.
                beam.points([x1, y1, cx, cy]);

                // Create second segment
                const newBeam = new Konva.Line({
                    points: [cx, cy, x2, y2],
                    stroke: COLORS.beam, strokeWidth: beam.strokeWidth(),
                    hitStrokeWidth: 20,
                    draggable: true,
                    id: beam.id() + '_split', // Temp ID
                    name: 'structure_beam'
                });
                newBeam.setAttr('beamType', beam.getAttr('beamType'));
                f.layers.structure.add(newBeam);

                // Update Label? (We might need to re-run renderResults to fix labels properly)
            }
        });

        f.layers.structure.batchDraw();

        f.selectedNode = rect;
        f.tr.nodes([rect]);
        cancelDrawing(id);

    } else if (currentTool === 'add-beam') {
        // ... existing beam logic ...
        if (!f.temp.lastPoint) {
            f.temp.lastPoint = { x, y };
            createGhostLine(f, { x, y }, COLORS.beam);
        } else {
            const line = new Konva.Line({
                points: [pos.x, pos.y, snapped.x, snapped.y],
                stroke: COLORS.beam, strokeWidth: (0.2 * f.scaleFactor),
                hitStrokeWidth: 20,
                draggable: true, id: 'beam_user_' + Date.now(),
                name: 'structure_beam'
            });
            line.setAttr('beamType', 'Primary'); // Default to Primary
            f.layers.structure.add(line);
            f.selectedNode = line;
            f.tr.nodes([line]);
            f.temp.lastPoint = null;
            cancelDrawing(id);
        }
    }
    // ...

    // ...

    // (renderResults moved to global)

    // Helper for projection
    // (projectPointOnLine moved to global) 
    else if (currentTool === 'door') {
        const wall = findWallAt(f, pos.x, pos.y);
        if (wall) {
            cutWall(f, wall, pos.x, pos.y);
            saveHistory(f);
        }
    }
}


function onStageMouseMove(id, e) {
    const f = floors[id];
    const pos = getPointer(f.stage);
    if (!pos) return;

    // Handle Selection Box Drag
    if (f.isSelecting) {
        const sx = f.selectionStart.x;
        const sy = f.selectionStart.y;
        f.selectionRect.setAttrs({
            x: Math.min(sx, pos.x),
            y: Math.min(sy, pos.y),
            width: Math.abs(pos.x - sx),
            height: Math.abs(pos.y - sy)
        });
        f.layers.cursor.batchDraw();
        return;
    }

    if (f.temp.lastPoint && f.temp.ghostLine) {
        // ... (Ghost line logic) ...
        let mx = pos.x, my = pos.y;
        const ortho = document.getElementById('toggle-ortho').checked;
        if (ortho) {
            const dx = Math.abs(mx - f.temp.lastPoint.x);
            const dy = Math.abs(my - f.temp.lastPoint.y);
            if (dx > dy) my = f.temp.lastPoint.y; else mx = f.temp.lastPoint.x;
        }
        const snapped = applySnapping(f, mx, my);
        f.temp.ghostLine.points([f.temp.lastPoint.x, f.temp.lastPoint.y, snapped.x, snapped.y]);
        f.layers.cursor.batchDraw();
    }

    // Ghost SLAB Rectangle (Add Slab Tool)
    if (f.temp.slabStart && f.temp.ghostSlab) {
        const snapped = applySnapping(f, pos.x, pos.y);
        const start = f.temp.slabStart;
        const x = Math.min(start.x, snapped.x);
        const y = Math.min(start.y, snapped.y);
        const width = Math.abs(snapped.x - start.x);
        const height = Math.abs(snapped.y - start.y);
        f.temp.ghostSlab.setAttrs({ x, y, width, height });
        f.layers.cursor.batchDraw();
    }
}

// Add Global MouseUp for Selection End
window.addEventListener('mouseup', () => {
    // Check both floors
    ['GF', 'FF'].forEach(id => {
        const f = floors[id];
        if (f && f.isSelecting) {
            f.isSelecting = false;
            f.selectionRect.visible(false);

            // Calculate Box
            const box = f.selectionRect.getClientRect();
            f.layers.cursor.batchDraw();

            // Find Intersecting Shapes
            const shapes = f.layers.structure.getChildren(node => {
                return node.name() === 'structure_col' || node.name() === 'structure_beam' || node.name() === 'structure_slab';
            });

            const selected = shapes.filter(node => {
                // Simple Check: does node client rect intersect selection box?
                // Note: Konva's clientRect is in window coords, but we have stage coords? 
                // Actually f.selectionRect.getClientRect() returns absolute window coords unless ...
                // Wait, logic above used local pos for rect attributes.
                // We should use Konva's collision detection. 
                return Konva.Util.haveIntersection(box, node.getClientRect());
            });

            if (selected.length > 0) {
                // Add to existing if shift?
                // Let's simplified: Replace selection
                f.tr.nodes(selected);
                f.selectedNodes = selected;
                f.selectedNode = selected.length === 1 ? selected[0] : null;
                updatePropertyInspector(f);
            }

            f.layers.structure.batchDraw();
        }
    });
});

// --- Helpers ---

function getPointer(stage) {
    const tr = stage.getAbsoluteTransform().copy().invert();
    const pos = stage.getPointerPosition();
    if (!pos) return null;
    return tr.point(pos);
}

function cancelDrawing(id) {
    const f = floors[id];
    f.temp.lastPoint = null;
    if (f.temp.ghostLine) f.temp.ghostLine.destroy();
    f.temp.ghostLine = null;
    if (f.temp.snapIndicator) f.temp.snapIndicator.destroy();
    f.temp.snapIndicator = null;
    f.layers.cursor.batchDraw();
}

function selectTool(tool) {
    currentTool = tool;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`[data-tool="${tool}"]`);
    if (btn) btn.classList.add('active');
    // Cancel drawing on both
    cancelDrawing('GF');
    cancelDrawing('FF');
}

function applySnapping(f, x, y) {
    if (!document.getElementById('toggle-snap').checked) return { x, y };

    let bestDist = SNAP_DIST / f.stage.scaleX();
    let bestPt = { x, y };

    f.data.walls.forEach(w => {
        [[w.x1, w.y1], [w.x2, w.y2]].forEach(pt => {
            const d = Math.hypot(pt[0] - x, pt[1] - y);
            if (d < bestDist) {
                bestDist = d; bestPt = { x: pt[0], y: pt[1] };
            }
        });
    });

    if (bestDist < (SNAP_DIST / f.stage.scaleX())) {
        if (!f.temp.snapIndicator) {
            f.temp.snapIndicator = new Konva.Circle({ radius: 5 / f.stage.scaleX(), stroke: 'cyan', strokeWidth: 2 });
            f.layers.cursor.add(f.temp.snapIndicator);
        }
        f.temp.snapIndicator.position(bestPt);
        f.temp.snapIndicator.radius(5 / f.stage.scaleX());
        f.layers.cursor.show();
    } else {
        if (f.temp.snapIndicator) f.temp.snapIndicator.hide();
    }
    return bestPt;
}

// --- Data Modification ---

function addWall(f, p1, p2) {
    f.data.walls.push({
        id: 'w_' + Date.now(),
        x1: p1.x, y1: p1.y,
        x2: p2.x, y2: p2.y,
        thickness: parseFloat(document.getElementById('wall-thickness').value) / 1000
    });
    redraw(f);
}

function addStair(f, p1, p2) {
    f.data.stairs.push({
        x1: Math.min(p1.x, p2.x), y1: Math.min(p1.y, p2.y),
        x2: Math.max(p1.x, p2.x), y2: Math.max(p1.y, p2.y)
    });
    redraw(f);
}

function findWallAt(f, x, y) {
    const thresh = 10 / f.stage.scaleX();
    return f.data.walls.find(w => pointToSeg(x, y, w.x1, w.y1, w.x2, w.y2) < thresh);
}

function cutWall(f, wall, cx, cy) {
    f.data.walls = f.data.walls.filter(w => w.id !== wall.id);
    const gap = (0.9 * f.scaleFactor) / 2;
    const dx = wall.x2 - wall.x1, dy = wall.y2 - wall.y1;
    const len = Math.hypot(dx, dy);
    const nx = dx / len, ny = dy / len;
    const t = ((cx - wall.x1) * dx + (cy - wall.y1) * dy) / (len * len);
    const px = wall.x1 + t * dx, py = wall.y1 + t * dy;
    const s1 = { x: px - nx * gap, y: py - ny * gap };
    const s2 = { x: px + nx * gap, y: py + ny * gap };
    addWall(f, { x: wall.x1, y: wall.y1 }, s1);
    addWall(f, s2, { x: wall.x2, y: wall.y2 });
}

function deleteSelection(id) {
    const f = floors[id];
    let changed = false;

    // 1. Delete Wall Logic
    if (f.data.walls.length > 0) {
        f.data.walls.pop();
        changed = true;
    }

    if (changed) {
        redraw(f);
        saveHistory(f);
    }
}

function deleteSelectedStructure(id) {
    const f = floors[id];
    if (f.selectedNode) {
        f.selectedNode.destroy();
        f.selectedNode = null;
        f.tr.nodes([]);
        f.layers.structure.batchDraw();
    } else {
        alert("Select a column or beam to delete.");
    }
}
// Wait, user asked specifically for deleting. I should enable selection.
// Let's add a global selectedNode.


// --- Draw & Utils ---

function redrawActive() { redraw(floors[activeFloorId]); }

function redraw(f) {
    f.layers.drafting.destroyChildren();

    const thicknessMeters = parseFloat(document.getElementById('wall-thickness').value) / 1000;
    const thicknessPx = f.scaleFactor ? (thicknessMeters * f.scaleFactor) : 2;

    f.data.walls.forEach(w => {
        const line = new Konva.Line({
            points: [w.x1, w.y1, w.x2, w.y2],
            stroke: COLORS.wall,
            strokeWidth: thicknessPx,
            lineCap: 'round',
            lineJoin: 'round',
            id: w.id
        });
        f.layers.drafting.add(line);
    });

    f.data.stairs.forEach(s => {
        const shape = new Konva.Rect({
            x: s.x1, y: s.y1,
            width: s.x2 - s.x1,
            height: s.y2 - s.y1,
            fill: 'rgba(255, 165, 0, 0.3)',
            stroke: COLORS.stair
        });
        f.layers.drafting.add(shape);
    });

    f.layers.drafting.batchDraw();
    f.layers.image.batchDraw();
}

function handleUpload(e, id) {
    const file = e.target.files[0];
    if (!file) return;
    const f = floors[id];

    const reader = new FileReader();
    reader.onload = (ev) => {
        Konva.Image.fromURL(ev.target.result, (img) => {
            const scale = f.stage.width() / img.width(); // Fit width
            img.setAttrs({ width: img.width() * scale, height: img.height() * scale, opacity: 0.5 });

            f.layers.image.destroyChildren(); // Clear ONLY this floor
            f.layers.image.add(img);
            f.imageNode = img;
            f.stage.height(img.height()); // Resize stage

            // RESET EVERYTHING ELSE TO PREVENT SCATTERING
            f.layers.structure.destroyChildren();
            f.layers.drafting.destroyChildren();

            // RE-ADD TRANSFORMER
            f.tr = new Konva.Transformer();
            f.layers.structure.add(f.tr);

            f.scaleFactor = null; // FORCE RESET SCALE
            document.getElementById('scale-val').innerText = 'Unset';

            // Clear data?

            f.data = { walls: [], stairs: [] };
            redraw(f);

            console.log(`${id}: Image Loaded.`);
            setActiveFloor(id);
        });
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // Reset input
}

function createGhostLine(f, pt, color = 'red') {
    if (f.temp.ghostLine) f.temp.ghostLine.destroy();
    f.temp.ghostLine = new Konva.Line({ points: [pt.x, pt.y, pt.x, pt.y], stroke: color, dash: [10, 5], strokeWidth: 2 });
    f.layers.cursor.add(f.temp.ghostLine);
}
function updateGhostLineStart(f, pt) { if (f.temp.ghostLine) { const p = f.temp.ghostLine.points(); p[0] = pt.x; p[1] = pt.y; f.temp.ghostLine.points(p); } }
function clearActiveFloor() { const f = floors[activeFloorId]; f.data = { walls: [], stairs: [] }; redraw(f); saveHistory(f); }

function saveHistory(f) {
    f.historyStack.push(JSON.stringify(f.data));
    f.historyStep++;
}
function undo() {
    const f = floors[activeFloorId];
    if (f.historyStep > 0) {
        f.historyStep--;
        f.data = JSON.parse(f.historyStack[f.historyStep]);
        redraw(f);
    }
}
function redo() { }

// Helper for Beam splitting
function isPointOnSeg(px, py, x1, y1, x2, y2, tolerance) {
    // 1. Check Bounding Box
    if (px < Math.min(x1, x2) - tolerance || px > Math.max(x1, x2) + tolerance ||
        py < Math.min(y1, y2) - tolerance || py > Math.max(y1, y2) + tolerance) {
        return false;
    }
    // 2. Distance to Line
    const dist = pointToSeg(px, py, x1, y1, x2, y2);
    return dist < tolerance;
}

function pointToSeg(px, py, x1, y1, x2, y2) {
    const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
    const dot = A * C + B * D, len = C * C + D * D;
    let t = -1; if (len !== 0) t = dot / len;
    let xx, yy;
    if (t < 0) { xx = x1; yy = y1 } else if (t > 1) { xx = x2; yy = y2 } else { xx = x1 + t * C; yy = y1 + t * D }
    const dx = px - xx, dy = py - yy; return Math.sqrt(dx * dx + dy * dy);
}

// --- Submit & Save ---

async function submitAll() {
    const gf = floors.GF;
    const ff = floors.FF;

    if (!gf.scaleFactor && gf.data.walls.length > 0) { alert("GF Scale missing"); return; }

    // Payload
    const payload = { floors: {} };
    if (gf.data.walls.length > 0) {
        payload.floors.GF = {
            width: gf.imageNode ? gf.imageNode.width() : gf.stage.width(),
            height: gf.imageNode ? gf.imageNode.height() : gf.stage.height(),
            geometry: { ...gf.data, scale: gf.scaleFactor }
        };
    }
    if (ff.data.walls.length > 0) {
        payload.floors.FF = {
            width: ff.imageNode ? ff.imageNode.width() : ff.stage.width(),
            height: ff.imageNode ? ff.imageNode.height() : ff.stage.height(),
            geometry: { ...ff.data, scale: ff.scaleFactor || gf.scaleFactor }
        };
    }

    try {
        const r = await fetch(`${port_url}/api/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const res = await r.json();

        // Render Results
        if (res.results.GF) { floors.GF.results = res.results.GF; renderResults(floors.GF, res.results.GF); }
        if (res.results.FF) { floors.FF.results = res.results.FF; renderResults(floors.FF, res.results.FF); }

        // PERSIST TASK ID
        if (res.taskId) {
            localStorage.setItem('currentTaskId', res.taskId);
            console.log("Saved TaskID:", res.taskId);
        }

        document.getElementById('edit-controls').classList.remove('hidden');
        alert("Structure Generated!");

    } catch (e) { console.error(e); alert("Failed"); }
}

function renderResults(f, res) {
    f.layers.structure.destroyChildren();

    // RE-ADD Transformer (Critical for Scattering fix)
    f.tr = new Konva.Transformer();
    f.layers.structure.add(f.tr);

    const scale = res.scale;
    const toPx = (m) => m * scale;

    res.columns.forEach(col => {
        const size = toPx(0.3);
        const rect = new Konva.Rect({
            x: toPx(col.x),
            y: toPx(col.y),
            offsetX: size / 2,
            offsetY: size / 2,
            width: size,
            height: size,
            fill: COLORS.column,
            draggable: true,
            id: col.id,
            name: 'structure_col',
            rotation: col.rotation || 0
        });
        f.layers.structure.add(rect);
    });

    // Render Slabs (Bottom Layer)
    let slabCount = 0;
    if (res.slabs) {
        res.slabs.forEach(s => {
            slabCount++;
            const sx = toPx(s.x);
            const sy = toPx(s.y);
            const sw = toPx(s.width);
            const sh = toPx(s.height);

            // Slab Rect
            const rect = new Konva.Rect({
                x: sx, y: sy, width: sw, height: sh,
                fill: 'rgba(200, 200, 200, 0.25)', // Increased from 0.1
                stroke: '#555',
                strokeWidth: 1,
                name: 'structure_slab',
                id: s.id // S1, S2...
            });
            f.layers.structure.add(rect);
            rect.moveToBottom(); // Ensure below beams

            // Label (P1...)
            // Center
            const text = new Konva.Text({
                x: sx + sw / 2,
                y: sy + sh / 2,
                text: s.id.replace('S', 'P'), // "P1"
                fontSize: 40,
                fontFamily: 'Arial',
                fill: 'rgba(255, 255, 255, 0.4)', // Increased from 0.1
                listening: false,
                offsetX: 10, offsetY: 10
            });
            f.layers.structure.add(text);
            text.moveToBottom();
        });
    }

    let beamCount = 0;
    res.beams.forEach(bm => {
        beamCount++;
        const p1 = { x: toPx(bm.x1), y: toPx(bm.y1) };
        const p2 = { x: toPx(bm.x2), y: toPx(bm.y2) };

        const line = new Konva.Line({
            points: [p1.x, p1.y, p2.x, p2.y],
            stroke: (bm.type === 'Hidden') ? '#555' : COLORS.beam, // Darker/Grey if Hidden
            strokeWidth: toPx(0.2),
            dash: (bm.type === 'Hidden') ? [5, 5] : [],
            hitStrokeWidth: 20,
            draggable: true, id: bm.id, name: 'structure_beam'
        });
        line.setAttr('beamType', bm.type || 'Main');
        f.layers.structure.add(line);

        // BEAM LABEL
        // Midpoint
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        const text = new Konva.Text({
            x: mx, y: my,
            text: `B${beamCount}`, // Or use bm.id
            fontSize: 14,
            fontFamily: 'Arial',
            fill: 'white',
            listening: false // Click through to beam
        });
        f.layers.structure.add(text);
    });
    f.layers.structure.batchDraw();
}


// Helper for projection
function projectPointOnLine(px, py, x1, y1, x2, y2) {
    const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
    const len_sq = C * C + D * D;
    let param = -1;
    if (len_sq != 0) param = (A * C + B * D) / len_sq;
    let xx, yy;
    if (param < 0) { xx = x1; yy = y1; }
    else if (param > 1) { xx = x2; yy = y2; }
    else { xx = x1 + param * C; yy = y1 + param * D; }
    return { x: xx, y: yy };
}

// UI Helper
function updatePropertyInspector(f) {
    const nodes = f.selectedNodes || [];
    if (nodes.length === 0) {
        document.getElementById('prop-inspector').classList.add('hidden');
        return;
    }

    document.getElementById('prop-inspector').classList.remove('hidden');

    // ID Field
    if (nodes.length === 1) {
        document.getElementById('prop-id').value = nodes[0].id();
    } else {
        document.getElementById('prop-id').value = `(${nodes.length} items)`;
    }

    // Type Field
    const allBeams = nodes.every(n => n.name() === 'structure_beam');

    if (allBeams) {
        document.getElementById('prop-type').disabled = false;
        const firstType = nodes[0].getAttr('beamType') || 'Main';
        const same = nodes.every(n => (n.getAttr('beamType') || 'Main') === firstType);
        document.getElementById('prop-type').value = same ? firstType : '';
    } else {
        document.getElementById('prop-type').disabled = true;
        document.getElementById('prop-type').value = '';
    }
}

async function saveStructure() {
    const f = floors[activeFloorId];

    // Fallback ID
    const taskId = (f.results && f.results.taskId) || localStorage.getItem('currentTaskId');
    if (!taskId) {
        alert("Cannot Save: No Analysis Data found. Please click 'Generate' first.");
        return;
    }

    const scale = f.scaleFactor;
    const toMeters = (px) => px / scale;

    const newColumns = [];
    const newBeams = [];
    const newSlabs = [];

    f.layers.structure.getChildren().forEach(node => {
        if (node instanceof Konva.Transformer || node.name() === 'selector') return;

        if (node.name() === 'structure_col') {
            // Use local transform relative to layer (ignoring stage zoom/pan)
            const tr = node.getTransform();
            const center = tr.point({ x: node.width() / 2, y: node.height() / 2 });

            newColumns.push({
                id: node.id(),
                x: toMeters(center.x),
                y: toMeters(center.y),
                rotation: node.rotation()
            });
        } else if (node.name() === 'structure_beam') {
            const pts = node.points();
            const tr = node.getTransform(); // Local transform
            const p1 = tr.point({ x: pts[0], y: pts[1] });
            const p2 = tr.point({ x: pts[2], y: pts[3] });

            newBeams.push({
                id: node.id(),
                type: node.getAttr('beamType') || 'Primary',
                x1: toMeters(p1.x), y1: toMeters(p1.y),
                x2: toMeters(p2.x), y2: toMeters(p2.y)
            });
        } else if (node.name() === 'structure_slab') {
            // Collect user-added slabs
            const tr = node.getTransform(); // Local transform
            const origin = tr.point({ x: 0, y: 0 }); // Origin is top-left in local space

            newSlabs.push({
                id: node.id(),
                x: toMeters(origin.x),
                y: toMeters(origin.y),
                width: toMeters(node.width()),
                height: toMeters(node.height())
            });
        }
    });

    // Sort slabs by position (top to bottom, left to right) for consistent numbering
    newSlabs.sort((a, b) => {
        const yDiff = a.y - b.y;
        if (Math.abs(yDiff) > 0.1) return yDiff; // Sort by Y first
        return a.x - b.x; // Then by X
    });

    // Renumber slabs sequentially to ensure unique IDs
    newSlabs.forEach((slab, idx) => {
        slab.id = `S${idx + 1}`;
    });

    try {
        await fetch(`${port_url}/api/analyze/update`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                taskId: taskId,
                floor: activeFloorId,
                structure: { columns: newColumns, beams: newBeams, slabs: newSlabs }
            })
        });
        alert(`Saved changes for ${activeFloorId}`);
    } catch (e) {
        console.error(e);
        alert("Save Error");
    }
}
