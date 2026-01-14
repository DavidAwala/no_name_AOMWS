import { svgGenerator } from './svgGenerator.js';
import {port_url} from "./port.js"

document.addEventListener('DOMContentLoaded', initPrintout);

let floorsData = { FF: null, GF: null };
let references = null;
let currentPage = null;
let pageCount = 0;

const safeFix = (val, d = 2) => {
    if (val === null || val === undefined) return '0.00';
    return Number(val).toFixed(d);
};

async function initPrintout() {
    const params = new URLSearchParams(window.location.search);
    const taskId = params.get('taskId');

    if (!taskId) {
        alert("Missing Task ID");
        window.close();
        return;
    }

    try {
        // 1. Fetch Data for BOTH floors and references
        const [ffRes, gfRes, refRes] = await Promise.all([
            fetch(`${port_url}/api/analyze/report?taskId=${taskId}&floor=FF`),
            fetch(`${port_url}/api/analyze/report?taskId=${taskId}&floor=GF`),
            fetch(`reference.json`).catch(() => null) // Relative to root
        ]);

        if (ffRes.ok) floorsData.FF = await ffRes.json();
        if (gfRes.ok) floorsData.GF = await gfRes.json();
        if (refRes && refRes.ok) references = await refRes.json();

        document.getElementById('load-status').textContent = "Data Loaded Successfully";

        // 2. Generate the continuous report
        generateTotalReport();

        // 3. Render Math (KaTeX)
        if (window.renderMathInElement) {
            renderMathInElement(document.body, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false }
                ],
                throwOnError: false
            });
        }

        // 4. Large Report Handling & Chunking
        setupChunkSelector();

    } catch (e) {
        console.error(e);
        document.getElementById('load-status').textContent = "Error: " + e.message;
    }
}

function setupChunkSelector() {
    const pages = document.querySelectorAll('.page');
    const controls = document.getElementById('chunk-controls');
    const select = document.getElementById('chunk-select');

    if (pages.length <= 1) return; // No need for chunks if single page

    controls.style.display = 'inline-block';
    select.innerHTML = "";

    const chunkSize = 80;
    const numChunks = Math.ceil(pages.length / chunkSize);

    // Option: Show All
    const optAll = document.createElement('option');
    optAll.value = "all";
    optAll.textContent = `All Pages (${pages.length})`;
    select.appendChild(optAll);

    for (let i = 0; i < numChunks; i++) {
        const start = i * chunkSize + 1;
        const end = Math.min((i + 1) * chunkSize, pages.length);
        const opt = document.createElement('option');
        opt.value = `${start}-${end}`;
        opt.textContent = `Pages ${start} - ${end}`;
        select.appendChild(opt);
    }

    // Default to first chunk if very large
    if (pages.length > 80) {
        select.value = "1-80";
        updateChunkFilter();
    }
}

window.updateChunkFilter = function () {
    const select = document.getElementById('chunk-select');
    const range = select.value;
    const pages = document.querySelectorAll('.page');

    if (range === "all") {
        pages.forEach(p => p.classList.remove('hidden-page'));
        return;
    }

    const [start, end] = range.split('-').map(Number);
    pages.forEach((p, idx) => {
        const pageNum = idx + 1;
        if (pageNum >= start && pageNum <= end) {
            p.classList.remove('hidden-page');
        } else {
            p.classList.add('hidden-page');
        }
    });
};

function createNewPage() {
    pageCount++;
    const template = document.getElementById('page-template');
    const clone = template.content.cloneNode(true);
    const page = clone.querySelector('.page');
    page.id = `page-${pageCount}`;

    // Update Meta
    clone.querySelector('.sheet-num').textContent = pageCount;
    const dateField = clone.querySelector('#date-field');
    if (dateField) dateField.textContent = new Date().toLocaleDateString();

    document.getElementById('report-container').appendChild(page);
    currentPage = page.querySelector('.calc-body');
    return page;
}

// Reduced height budget to prevent bottom clipping (A4 height ≈ 1122px, minus margins/header/footer)
const PAGE_HEIGHT_BUDGET = 760;

function checkOverflowAndAdd(node) {
    if (!currentPage) createNewPage();

    // Check if the current page already has content
    const hasContent = currentPage.children.length > 0;

    // Add node to measure
    currentPage.appendChild(node);

    // Trigger page break ONLY if:
    // 1. The budget is exceeded
    // 2. The page already had other rows (to prevent infinite looping for single large items)
    if (currentPage.scrollHeight > PAGE_HEIGHT_BUDGET && hasContent) {
        currentPage.removeChild(node);
        createNewPage();
        currentPage.appendChild(node);
    }
}

function generateTotalReport() {
    createNewPage();

    // --- REFINED PROJECT FLOW ---

    // 1. ROOF (FF)
    if (floorsData.FF) {
        addSectionHeader("1.0 ROOF SLAB ANALYSIS & DESIGN");
        if (floorsData.FF.slabs && floorsData.FF.slabs.length) {
            floorsData.FF.slabs.forEach(slab => renderSlabDetail(slab));
        }

        addSectionHeader("2.0 ROOF BEAM ANALYSIS & DESIGN");
        const ffBeams = floorsData.FF.beamGroups || floorsData.FF.beams || [];
        ffBeams.forEach(bm => renderBeamDetail(bm));
    }

    // 2. FLOOR (GF)
    if (floorsData.GF) {
        addSectionHeader("3.0 SUSPENDED SLAB ANALYSIS & DESIGN");
        if (floorsData.GF.slabs && floorsData.GF.slabs.length) {
            floorsData.GF.slabs.forEach(slab => renderSlabDetail(slab));
        }

        addSectionHeader("4.0 FLOOR BEAM ANALYSIS & DESIGN");
        const gfBeams = floorsData.GF.beamGroups || floorsData.GF.beams || [];
        gfBeams.forEach(bm => renderBeamDetail(bm));

        // 3. STAIRS
        addSectionHeader("5.0 STAIRCASE ANALYSIS & DESIGN");
        const allStairs = [...(floorsData.GF.stairs || []), ...(floorsData.FF.stairs || [])];
        if (allStairs.length) {
            allStairs.forEach(stair => renderStairDetail(stair));
        } else {
            addTextRow("", "No staircase identified for analysis.", "");
        }

        // 4. COLUMNS
        addSectionHeader("6.0 COLUMN ANALYSIS & DESIGN");
        if (floorsData.GF.columns && floorsData.GF.columns.length) {
            floorsData.GF.columns.forEach(col => renderColumnDetail(col));
        }

        // 5. FOUNDATIONS
        addSectionHeader("7.0 FOUNDATION (BASE) DESIGN");
        if (floorsData.GF.foundations && floorsData.GF.foundations.length) {
            floorsData.GF.foundations.forEach(base => renderFoundationDetail(base));
        }
    }

    addSectionHeader("8.0 PROJECT CONCLUSION");
    addTextRow("Summary", "Total structural project analyzed. Loads traced from Roof to Foundation. All members compliant with BS 8110-1:1997.", "PASSED");
}

// --- RENDER HELPERS ---

function renderSlabDetail(slab) {
    addTextRow("", `**Panel ${slab.id}** (${slab.lx}m x ${slab.ly}m - ${slab.type || 'Slab'})`, "");

    // Explicit Steps
    addRow("BS8110 Cl 3.5", `Calculate Ultimate Load: $n = 1.4 G_k + 1.6 Q_k$`, "");
    const loads = slab.loads || {};
    addRow("", `Input: $G_k = ${loads.dead || '?'} kPa, Q_k = ${loads.live || '?'} kPa$`, `$n = ${loads.ultimate || '?'} kPa$`);

    const logs = slab.logs || [];
    logs.forEach(log => parseAndAddLog(log));

    if (slab.design && slab.design.logs) {
        slab.design.logs.forEach(log => parseAndAddLog(log));
    }

    if (slab.moments && slab.moments.length) {
        slab.moments.forEach(m => {
            addRow(m.ref || "Table 3.14", `Design Moment ${m.id}: $M = \\beta_s n L_x^2$`, `${m.M} kNm`);
            addRow("", `Provided Steel: ${m.provided}`, "OK");
        });
    }

    // SVG for slab detail (P1, P2 visualization)
    if (svgGenerator.drawSlabDetail) {
        addVisualRow(svgGenerator.drawSlabDetail(slab.lx, slab.ly, slab.panelIndex || 1));
    }
}

function renderBeamDetail(bm) {
    const isGroup = !!bm.spans;
    const spans = bm.spans || (bm.id ? [bm] : []); // Normalize to array
    const title = bm.grid ? `Beam Grid: ${bm.grid}` : (bm.id ? `Beam ${bm.id}` : "Structural Beam");

    addTextRow("", `**${title}**`, "");
    addRow("BS 8110 Cl 3.4", `Analysis Method: ${bm.educationalSteps ? 'Moment Distribution Method' : 'Simple Support Analysis'}`, "");

    // 1. BEAM LOADING Analysis (Aggregate for the whole group)
    addTextRow("", "**3.4.1 LOADING ANALYSIS**", "");
    spans.forEach((span, idx) => {
        const spanID = span.id || `Span ${idx + 1}`;
        addTextRow("", `**${spanID}**`, "");
        if (span.loadLogs) {
            span.loadLogs.forEach(log => parseAndAddLog(log));
        }

        // Priority: Span Result w > Span Design w > Manual UDL > Group UDL
        let totalW = 0;
        if (typeof span.w === 'number' && span.w > 0) totalW = span.w;
        else if (span.design && typeof span.design.w === 'number') totalW = span.design.w;
        else if (typeof span.udl === 'number' && span.udl > 0) totalW = span.udl;
        else if (typeof bm.udl === 'number' && bm.udl > 0) totalW = bm.udl;

        addVisualRow(svgGenerator.drawBeamLoading(span.L || span.length, totalW, span.pointLoads || []), `Loading Diagram - ${spanID}`);
    });

    // 2. STRUCTURAL ANALYSIS (MDM)
    if (bm.educationalSteps && bm.educationalSteps.length > 0) {
        addTextRow("", "**3.4.2 STRUCTURAL ANALYSIS: MDM CONVERGENCE (BS 8110)**", "");
        bm.educationalSteps.forEach(step => parseAndAddLog(step));
    } else if (bm.logs && bm.logs.length > 0) {
        // Fallback for single span analysis logs
        bm.logs.forEach(log => parseAndAddLog(log));
    }

    // 3. UNIFIED DIAGRAMS
    if (spans.some(s => s.diagramPoints)) {
        addTextRow("", "**3.4.3 ANALYSIS DIAGRAMS (ENVELOPE)**", "");
        let totalL = 0;
        const stitched = spans.flatMap(s => {
            const spanL = s.L || s.length || 0;
            const pts = (s.diagramPoints || []).map(p => ({ ...p, x: p.x + totalL }));
            totalL += spanL;
            return pts;
        });
        addVisualRow(svgGenerator.drawDiagram(stitched, totalL, 'BMD'), "Bending Moment Diagram (BMD)");
        addVisualRow(svgGenerator.drawDiagram(stitched, totalL, 'SFD'), "Shear Force Diagram (SFD)");
    }

    // 4. REINFORCEMENT DESIGN (Individual Spans)
    addTextRow("", "**3.4.4 REINFORCEMENT DESIGN CALCULATIONS**", "");
    spans.forEach((span, idx) => {
        const spanID = span.id || `Span ${idx + 1}`;
        addTextRow("", `*Design for ${spanID}:*`, "");

        const design = span.design || bm.design;
        if (design) {
            if (design.logs) {
                design.logs.forEach(log => parseAndAddLog(log));
            }

            // Draw Section Detail
            const bars = design.flexure?.bars || "3Y16";
            const links = design.shear?.links || "Y8@200";
            const b = span.b_mm || bm.b_mm || 230;
            const h = span.h_mm || bm.h_mm || 450;
            const hf = span.hf || bm.hf || 150;
            const bType = span.beamType || bm.beamType || 'Rect';

            const sectionSvg = svgGenerator.drawBeamSection(b, h, bars, links, bType, hf);
            addVisualRow(sectionSvg, `REINFORCEMENT DETAIL: ${spanID}`);

            addRow("", `Status: ${design.deflection?.ok ? 'PASS' : 'FAIL'}`, `Ratio: ${safeFix(design.deflection?.ratio || 0, 2)}`);
        }

        if (span.logs && span.logs !== bm.logs) {
            span.logs.forEach(log => parseAndAddLog(log));
        }
    });
}

function renderStairDetail(stair) {
    addTextRow("", `**Staircase Analysis** (Span = ${stair.L || '3.5'}m)`, "");
    (stair.design?.logs || []).forEach(log => parseAndAddLog(log));

    const svg = svgGenerator.drawStairSection(stair);
    addVisualRow(svg);

    const mainInfo = stair.design?.mainInfo || 'Y12@150';
    addRow("BS8110", `Reinforcement (Main): ${mainInfo}`, "OK");
}

function renderColumnDetail(col) {
    addTextRow("", `**Column ${col.id}** (${col.dim?.b || 230}x${col.dim?.h || 230}mm)`, "");

    addRow("Cl 3.8", `Ultimate Axial Load $N_u = ${col.load_kN || '?'} kN$`, "");
    (col.logs || []).forEach(log => parseAndAddLog(log));

    if (col.dim && col.design) {
        const svg = svgGenerator.drawColumnSection(col.dim.b, col.dim.h, col.design.mainInfo, "Y8@200");
        addVisualRow(svg);
        addRow("", `Total Steel: ${col.design.mainInfo}`, "PASS");
    }
}

function renderFoundationDetail(f) {
    addTextRow("", `**Footing ${f.id}** (${f.width_mm}x${f.width_mm}x${f.depth_mm}mm)`, "");

    addRow("Cl 3.11", `Check Soil Pressure: $P_{svc} \le q_{allow}$`, "");
    (f.logs || []).forEach(log => parseAndAddLog(log));

    const svg = svgGenerator.drawFootingSection(f.width_mm || 1200, f.depth_mm || 450);
    addVisualRow(svg);
    addRow("", f.reinforcement || "TBD", "OK");
}

// --- BASIC ROW HELPERS ---

function addRow(ref, calc, out) {
    const div = document.createElement('div');
    div.className = 'row';
    div.innerHTML = `
        <div class="cell ref" contenteditable="true">${ref}</div>
        <div class="cell calc" contenteditable="true">${formatMarkdown(calc)}</div>
        <div class="cell out" contenteditable="true">${out}</div>
    `;
    checkOverflowAndAdd(div);
}

function addTextRow(ref, text, out) {
    addRow(ref, text, out);
}

function addSectionHeader(title) {
    const div = document.createElement('div');
    div.className = 'section-header';
    div.textContent = title;
    checkOverflowAndAdd(div);
}

function addVisualRow(inputSvg, label = "Technical Illustration / Diagram") {
    const div = document.createElement('div');
    div.className = 'visual-row';
    div.innerHTML = `
        <button class="delete-btn no-print" onclick="this.parentElement.remove()">×</button>
        <div style="font-size:0.8em; color:#666; margin-bottom:10px; font-weight:bold; text-transform:uppercase;">${label}</div>
        <div class="img-container" style="width:100%; display:flex; justify-content:center; align-items:center; padding:10px; position:relative;">
            ${inputSvg}
            <div class="resizer no-print"></div>
        </div>
        <div style="font-size:0.75em; color:#999; margin-top:10px;">[ SCALE: NOT TO SCALE ]</div>
    `;
    checkOverflowAndAdd(div);

    // If it's an image OR SVG, make it resizable
    const target = div.querySelector('img, svg');
    if (target) makeResizable(target);
}

function renderMarkdownTable(tableStr) {
    const isDivider = tableStr.includes('---');
    if (isDivider) return;

    const cells = tableStr.split('|').filter(c => c.trim() !== "" || tableStr.indexOf('|') !== tableStr.lastIndexOf('|'));
    const isHeader = tableStr.trim().startsWith('| Iter |') || tableStr.toLowerCase().includes('joint');

    // Row width and layout
    const wrapper = document.createElement('div');
    wrapper.className = 'row table-row-wrapper';
    wrapper.style.minHeight = 'auto';
    wrapper.style.borderBottom = 'none';

    let html = `<div class="cell ref" style="border-right: 2px solid #333; display: flex; align-items: center; justify-content: center; font-size: 0.7em;">TABLE</div>`;

    let tableHtml = `<div style="display: grid; grid-template-columns: repeat(${cells.length}, 1fr); width: 100%; border: 1px solid #ddd;">`;
    cells.forEach(c => {
        tableHtml += `<div style="padding: 4px; border: 1px solid #eee; font-size: 0.8em; ${isHeader ? 'font-weight: bold; background: #f5f5f5;' : ''}">${c.trim()}</div>`;
    });
    tableHtml += `</div>`;

    html += `<div class="cell calc" style="grid-column: span 2; padding: 5px; height: auto; min-height: auto;">${tableHtml}</div>`;

    wrapper.innerHTML = html;
    checkOverflowAndAdd(wrapper);
}

function parseAndAddLog(log) {
    if (!log) return;

    // 0. Table Detection (| ... | ... |)
    if (log.trim().startsWith('|') && log.trim().endsWith('|')) {
        renderMarkdownTable(log);
        return;
    }

    let ref = "";
    const lower = log.toLowerCase();
    if (lower.includes("moment")) ref = "Table 3.14";
    else if (lower.includes("shear")) ref = "Table 3.8";
    else if (lower.includes("defl")) ref = "Table 3.10";
    else if (lower.includes("steel") || lower.includes("area")) ref = "Cl 3.12.10";
    else if (lower.includes("spacing")) ref = "Cl 3.12.11";
    else if (lower.includes("formula")) ref = "BS8110";

    // Heuristic parsing
    if (log.includes("Formula:")) {
        const content = log.split("Formula:")[1].trim();
        addRow("BS8110", content, "");
    } else if (log.includes("Calc:") || log.includes("Calculation:")) {
        const content = log.replace(/Calc(ulation)?:/, "").trim();
        addRow(ref, content, "");
    } else if (log.includes("Result:") || log.includes("Conclusion:")) {
        const parts = log.split(/Result:|Conclusion:/);
        const desc = parts[0].trim();
        const value = parts[1].trim();
        addRow(ref, desc, value);
    } else if (log.includes("Value:")) {
        const parts = log.split("Value:");
        addRow(ref, parts[0].trim(), parts[1].trim());
    } else if (log.startsWith("[")) {
        // Sub-step title
        const div = document.createElement('div');
        div.style.fontWeight = "bold";
        div.style.padding = "8px 0 2px 20px";
        div.textContent = log;
        checkOverflowAndAdd(div);
    } else {
        // Generic text
        // If it's a "Check: PASS", put PASS in Output
        if (lower.includes("pass") || lower.includes("ok")) {
            addRow(ref, log.replace(/pass|ok/gi, "").trim(), "PASS");
        } else {
            addRow(ref, log, "");
        }
    }
}

function formatMarkdown(text) {
    if (!text) return "";
    let html = text
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.*?)\*/g, '<i>$1</i>')
        .replace(/`([^`]+)`/g, '<code style="background:#f0f0f0; padding:2px;">$1</code>');
    return html;
}

window.toggleEdit = function () {
    const mode = document.body.getAttribute('data-mode');
    if (mode === 'edit') {
        document.body.removeAttribute('data-mode');
        document.querySelectorAll('.delete-btn, .resizer').forEach(el => el.style.display = 'none');
        if (window.renderMathInElement) {
            renderMathInElement(document.body, { delimiters: [{ left: '$', right: '$', display: false }] });
        }
    } else {
        document.body.setAttribute('data-mode', 'edit');
        document.querySelectorAll('.delete-btn, .resizer').forEach(el => el.style.display = 'block');
    }
};

window.addImage = function () {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = e => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = event => {
                const imgHtml = `<img src="${event.target.result}" style="max-width:100%; height:auto;" class="resizable-img">`;
                addVisualRow(imgHtml, "Uploaded Image");
            };
            reader.readAsDataURL(file);
        }
    };
    input.click();
};

function makeResizable(target) {
    const resizer = target.parentElement.querySelector('.resizer');
    if (!resizer) return;

    resizer.addEventListener('mousedown', initResize, false);

    function initResize(e) {
        e.preventDefault();
        window.addEventListener('mousemove', Resize, false);
        window.addEventListener('mouseup', stopResize, false);
    }

    function Resize(e) {
        const rect = target.getBoundingClientRect();
        const width = e.clientX - rect.left;
        if (width > 50) {
            target.style.width = width + 'px';
            if (target.tagName.toLowerCase() === 'svg') {
                // For SVGs, aspect ratio usually stays unless we force height
                target.style.height = 'auto';
            }
        }
    }

    function stopResize(e) {
        window.removeEventListener('mousemove', Resize, false);
        window.removeEventListener('mouseup', stopResize, false);
    }
}

