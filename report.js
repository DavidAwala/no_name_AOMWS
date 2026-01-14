// client/report.js
import { svgGenerator } from './svgGenerator.js';
import {port_url} from "./port.js"

document.addEventListener('DOMContentLoaded', initReport);

const safeUI = (v, n) => {
    if (v === null || v === undefined) return '0.00';
    const num = parseFloat(v);
    return isNaN(num) ? (v || '0') : num.toFixed(n);
};

async function initReport() {
    const params = new URLSearchParams(window.location.search);
    const taskId = params.get('taskId');

    if (!taskId) {
        document.body.innerHTML = "<h1>Error: Missing Task ID</h1>";
        return;
    }

    const infoElem = document.getElementById('project-info');
    if (infoElem) {
        infoElem.innerHTML = `
            <strong>Task:</strong> ${taskId} | 
            <strong>Scope:</strong> Full Structural Project (Roof + Floor) | 
            <strong>Generated:</strong> ${new Date().toLocaleString()}
        `;
    }

    try {
        // Fetch BOTH reports
        const [ffRes, gfRes] = await Promise.all([
            fetch(`${port_url}/api/analyze/report?taskId=${taskId}&floor=FF`).catch(() => null),
            fetch(`${port_url}/api/analyze/report?taskId=${taskId}&floor=GF`).catch(() => null)
        ]);

        let ffData = ffRes && ffRes.ok ? await ffRes.json() : null;
        let gfData = gfRes && gfRes.ok ? await gfRes.json() : null;

        // Consolidate Data (Precedence: GF for common elements if cumulative, but we want both)
        const consolidated = {
            slabs: [...(ffData?.slabs || []), ...(gfData?.slabs || [])],
            beams: [...(ffData?.beams || []), ...(gfData?.beams || [])],
            columns: gfData?.columns || ffData?.columns || [], // GF Columns usually have FF loads added
            beamGroups: [...(ffData?.beamGroups || []), ...(gfData?.beamGroups || [])],
            foundations: gfData?.foundations || [],
            stairs: [...(ffData?.stairs || []), ...(gfData?.stairs || [])],
            _meta: gfData?._meta || ffData?._meta || {}
        };

        window.currentReport = consolidated;
        renderReport(consolidated);

        // Add Printout Link
        const btnPrint = document.getElementById('btn-engineering-printout');
        if (btnPrint) {
            btnPrint.addEventListener('click', () => {
                window.location.href = `printout.html?taskId=${taskId}`;
            });
        }
    } catch (e) {
        console.error(e);
        document.body.innerHTML += `<div style="color:red; border:1px solid red; padding:10px; margin-top:20px; font-family:sans-serif;">
            <h3 style="margin-top:0">Error Loading Combined Report Data</h3>
            <p>${e.message}</p>
        </div>`;
    }
}


function renderReport(report) {
    const content = document.getElementById('report-content');
    if (!content) return;
    content.innerHTML = '';

    if (report.slabs && report.slabs.length) createSection('Step 1: Slab Analysis', report.slabs, 'Slab', report);
    if (report.beams && report.beams.length) createSection('Step 2: Beam Analysis', report.beams, 'Beam', report);
    if (report.columns && report.columns.length) createSection('Step 3: Column Analysis', report.columns, 'Column', report);

    if (report.beamGroups && report.beamGroups.length) {
        renderAllBeamDesign(report.beamGroups, report);
    } else {
        const fallback = document.createElement('section');
        fallback.className = 'calc-section';
        fallback.innerHTML = `<h2 class="section-title">Step 4: Beam Design & Grid Analysis</h2><p style="color:#888; padding:20px; background:white; border-radius:8px;">No beams identified for design on this floor.</p>`;
        content.appendChild(fallback);
    }

    if (report.foundations && report.foundations.length) {
        createSection('Step 5: Foundation Design (BS 8110)', report.foundations, 'Foundation', report);
    }
}

function renderAllBeamDesign(beamGroups, report) {
    const content = document.getElementById('report-content');
    const section = document.createElement('section');
    section.className = 'calc-section';
    section.innerHTML = `<h2 class="section-title">Step 4: Continuous & Single-Span Beam Design</h2>`;

    (beamGroups || []).forEach(group => {
        if (!group) return;
        const groupCard = document.createElement('div');
        groupCard.className = 'calc-card';
        const isMDM = group.type?.includes('MDM') ?? false;
        groupCard.style.borderLeft = isMDM ? '5px solid #ff9800' : '5px solid #00bcd4';
        groupCard.style.marginBottom = '30px';

        // safeUI moved to global scope

        groupCard.innerHTML = `
            <div class="card-header" style="background: #222; color: white;">
                <div style="display:flex; flex-direction:column;">
                    <h3 style="margin:0; font-size:1.2em;">${group.grid || 'Unknown Grid'}</h3>
                    <small style="color:#888;">Analysis Method: ${group.type || 'Standard'}</small>
                </div>
                <div style="text-align:right;">
                    <span class="badge" style="background:#4caf50; margin-right:5px;">Shear Envelope: ${safeUI(group.globalMaxV, 1)}kN</span>
                    <span class="badge" style="background:${isMDM ? '#ff9800' : '#00bcd4'}">${(group.spans || []).length} Spans</span>
                </div>
            </div>
            <div style="padding: 15px;">
                ${(group.fullDiagram || (group.spans && group.spans.some(s => s.diagramPoints))) ? `
                    <div style="margin-bottom: 20px; background: #1a1a1a; padding: 15px; border-radius: 8px; border: 1px solid #333;">
                        <h4 style="color: #00bcd4; margin-top: 0; margin-bottom: 10px; border-bottom: 1px solid #444;">Unified Grid Analysis (Continuous BMD & SFD)</h4>
                        <div style="display: flex; flex-direction: column; gap: 15px;">
                            <div>
                                <div style="color: #888; font-size: 0.8em; margin-bottom: 5px;">Bending Moment Diagram (kN.m) - Sagging [+] / Hogging [-]</div>
                                ${(() => {
                    let offset = 0;
                    const stitchedPoints = group.spans.flatMap(s => {
                        const pts = (s.diagramPoints || []).map(p => ({ ...p, x: p.x + offset }));
                        offset += s.L;
                        return pts;
                    });
                    return svgGenerator.drawDiagram(stitchedPoints, group.totalLength, 'BMD');
                })()}
                            </div>
                            <div>
                                <div style="color: #888; font-size: 0.8em; margin-bottom: 5px;">Shear Force Diagram (kN)</div>
                                ${(() => {
                    let offset = 0;
                    const stitchedPoints = group.spans.flatMap(s => {
                        const pts = (s.diagramPoints || []).map(p => ({ ...p, x: p.x + offset }));
                        offset += s.L;
                        return pts;
                    }).sort((a, b) => a.x - b.x);
                    return svgGenerator.drawDiagram(stitchedPoints, group.totalLength, 'SFD');
                })()}
                            </div>
                        </div>
                    </div>
                ` : ''}
                ${group.trace ? `
                    <div style="margin-top:20px; background: #eee; padding: 15px; border-radius: 8px; border: 1px solid #ccc; color:#222;">
                        <h4 style="margin-top:0; color:#c62828; border-bottom: 2px solid #c62828; padding-bottom:5px;">Moment Distribution Method (MDM) Trace</h4>
                        <div style="font-size: 0.85em; margin-bottom: 10px;">
                            <strong>Stiffness & Distribution Factors:</strong><br/>
                            ${group.trace.DF ? `
                                <table style="width:100%; text-align:center; border:1px solid #aaa; margin-top:5px; background:white;">
                                    <tr style="background:#ddd;"><th>Support</th><th>Support Type</th><th>DF Left</th><th>DF Right</th></tr>
                                    ${group.trace.DF.map((df, i) => `<tr><td>S${i}</td><td>${i === 0 ? group.boundary?.left : (i === group.trace.DF.length - 1 ? group.boundary?.right : 'Interior')}</td><td>${safeUI(df.L, 3)}</td><td>${safeUI(df.R, 3)}</td></tr>`).join('')}
                                </table>` : 'N/A'}
                        </div>
                        <div style="font-size: 0.85em;">
                            <strong>Fixed End Moments (FEM):</strong><br/>
                            ${group.trace.FEM ? `
                                <table style="width:100%; text-align:center; border:1px solid #aaa; margin-top:5px; background:white;">
                                    <tr style="background:#ddd;"><th>Span</th><th>FEM Left (kNm)</th><th>FEM Right (kNm)</th></tr>
                                    ${group.trace.FEM.map((fem, i) => `<tr><td>Span ${i}</td><td>${safeUI(fem.L, 2)}</td><td>${safeUI(fem.R, 2)}</td></tr>`).join('')}
                                </table>` : 'N/A'}
                        </div>
                        <details style="margin-top:10px;">
                            <summary style="cursor:pointer; color:#1976d2; font-weight:bold;">View Iterative Balancing Steps</summary>
                            <div style="max-height: 300px; overflow-y: auto; background:#f5f5f5; padding:10px; border:1px solid #ddd; margin-top:5px; font-family:monospace; font-size:0.8em;">
                                ${(group.trace.iterationTrace || []).map(trace => `
                                    <div style="margin-bottom:8px; border-bottom:1px dashed #ccc; padding-bottom:4px;">
                                        <strong>Iter ${trace.iter} (${trace.type}):</strong><br/>
                                        Balances: ${trace.balances.map((b, i) => `S${i}[L:${safeUI(b.L, 2)}, R:${safeUI(b.R, 2)}]`).join(' | ')}
                                    </div>
                                `).join('')}
                            </div>
                        </details>
                    </div>
                ` : ''}
                ${group.educationalSteps ? `
                    <div style="margin-top:15px; border-top:1px dashed #bbb; padding-top:10px;">
                        <h5 style="margin:0 0 5px 0; color:#1565c0;">🎓 Step-by-Step Educational Logs (Reference Formulas)</h5>
                        <div style="background:#e3f2fd; padding:10px; border-radius:4px; font-family:'Courier New', monospace; font-size:0.85em; color:#0d47a1; white-space: pre-wrap; max-height:400px; overflow-y:auto;">${group.educationalSteps.join('\n')}</div>
                    </div>
                ` : ''}
                
                <div style="overflow-x: auto; margin-top:20px;">
                    <table class="report-table" style="width:100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #333; color: white;">
                                <th style="padding: 10px; border: 1px solid #444;">Span/Support</th>
                                <th style="padding: 10px; border: 1px solid #444;">Length/Ref</th>
                                <th style="padding: 10px; border: 1px solid #444;">Design Moment (kN.m)</th>
                                <th style="padding: 10px; border: 1px solid #444;">Reinforcement</th>
                                <th style="padding: 10px; border: 1px solid #444;">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(group.spans || []).map((span, idx) => `
                                <tr style="border-bottom: 1px solid #444; background: #2a2a2a;">
                                    <td style="padding: 10px; border: 1px solid #444; text-align: center; color:#fff;">Span ${span?.id || idx + 1}</td>
                                    <td style="padding: 10px; border: 1px solid #444; text-align: center;">${safeUI(span?.L, 2)}m</td>
                                    <td style="padding: 10px; border: 1px solid #444; text-align: center; color: #4caf50; font-weight: bold;">${safeUI(span?.maxSpanMoment, 2)}</td>
                                    <td style="padding: 10px; border: 1px solid #444; text-align: center;">
                                        <div style="display:flex; flex-direction:column; align-items:center; gap:5px;">
                                            ${svgGenerator.drawBeamSection(span?.b_mm || 230, span?.h_mm || 450, span?.design?.flexure?.bars, span?.design?.shear?.links, span?.design?.beamType || 'Rect', span?.hf || 150, span?.design?.flexure?.bf)}
                                            <span style="font-size:0.85em; color:#aaa;">${span?.design?.flexure?.bars || 'N/A'} (Bot)</span>
                                        </div>
                                    </td>
                                    <td style="padding: 10px; border: 1px solid #444; text-align: center; font-weight: bold; color: ${span?.design?.deflection?.ok ? '#4caf50' : '#f44336'};">
                                        L/d: ${safeUI(span?.design?.deflection?.actual, 1)} <br>
                                        ${span?.design?.deflection?.ok ? 'PASS' : 'FAIL'}
                                    </td>
                                </tr>
                                <tr>
                                    <td colspan="5" style="padding: 0; background: #222;">
                                        <details style="padding: 10px; color: #ccc; font-size: 0.85em;">
                                            <summary style="cursor: pointer; color: #00bcd4;">View Span ${span?.id || idx + 1} Step-by-Step Design (BS 8110)</summary>
                                            <div style="padding: 10px; border-top: 1px solid #333;">
                                                <div style="margin-bottom:15px; padding:10px; background:white; border-radius:8px;">
                                                    <h5 style="color:#d32f2f; margin:0 0 10px 0;">Span Loading Diagram</h5>
                                                    ${svgGenerator.drawBeamLoading(span.L || 0, (span.w || group.w || 0), span.pointLoads || [])}
                                                </div>
                                                <div style="background: #111; padding: 15px; border-radius: 8px; font-family: 'Courier New', monospace; font-size: 0.9em; line-height: 1.4; color: #00ff00; border: 1px solid #333;">
                                                    <h4 style="color: #00bcd4; margin-top: 0; border-bottom: 1px solid #444;">CALCULATION LOGS:</h4>
                                                    <div style="white-space: pre-wrap;">${(span.logs || span?.design?.logs || []).join('\n')}</div>
                                                </div>
                                            </div>
                                        </details>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        section.appendChild(groupCard);
    });
    content.appendChild(section);

    if (report.stairs && report.stairs.length > 0) {
        createSection('Staircase Design (BS 8110)', report.stairs, 'Stair', report);
    }
}

function createSection(title, items, type, report) {
    const content = document.getElementById('report-content');
    const section = document.createElement('section');
    section.className = 'calc-section';
    section.innerHTML = `<h2 class="section-title">${title}</h2>`;

    (items || []).forEach(item => {
        const card = document.createElement('div');
        card.className = 'calc-card';

        let headerHtml = `
            <div class="card-header">
                <h3>${type} ${item.id}</h3>
                <span class="badge badge-${type.toLowerCase()}">${item.type || 'Standard'}</span>
            </div>
        `;

        let statsHtml = `<div class="card-stats" style="display:grid; grid-template-columns: repeat(2, 1fr); gap:10px; font-size:0.9em;">`;
        if (type === 'Slab') {
            statsHtml += `
                <div><strong>Area:</strong> ${item.area} m²</div>
                <div><strong>Short Span (Lx):</strong> ${safeUI(item.lx, 2)} m</div>
                <div><strong>Ratio (Ly/Lx):</strong> ${safeUI(item.ly / item.lx, 2)}</div>
                <div><strong>Panel Type:</strong> ${item.panelIndex === 8 ? 'One-way' : 'Type ' + item.panelIndex}</div>
                <div style="grid-column: span 2; background: #fff3e0; padding: 5px; border-radius: 4px; border-left: 3px solid #ff9800;">
                    <strong>Design Moments (BS 8110):</strong>
                    <div style="font-size:0.85em; margin-top:3px;">Gk: ${item.loads.dead} kN/m² | Qk: ${item.loads.live} kN/m² | <strong>n: ${item.loads.ultimate} kN/m²</strong></div>
                </div>
            `;
        } else if (type === 'Beam') {
            statsHtml += `
                <div><strong>Span:</strong> ${item.span} m</div>
                <div><strong>Total Load (wL):</strong> ${item.totalForce || 0} kN</div>
                <div style="grid-column: span 2;"><strong>Reactions:</strong> <span style="color:blue">R1: ${item.reaction_kN ? item.reaction_kN + ' kN' : 'N/A'} | R2: ${item.reaction_kN ? item.reaction_kN + ' kN' : 'N/A'}</span></div>
            `;
        } else if (type === 'Column') {
            statsHtml += `
                <div><strong>Supporting:</strong> ${item.beams || 'None'}</div>
                <div><strong>Case:</strong> <span style="color:#e91e63; font-weight:bold;">${item.designCase || (report._meta.floor === 'GF' ? 'B' : 'Load Only')}</span></div>
                <div><strong>Nu:</strong> <span style="color:red; font-size:1.1em">${item.load_kN} kN</span></div>
                <div><strong>Slenderness:</strong> ${item.isSlender ? 'Slender' : 'Short'}</div>
            `;
            if (item.design && item.design.loads) {
                const params = Array.isArray(item.design.loads) ? item.design.loads : [];
                statsHtml += `
                    <div style="grid-column: span 2; font-size:0.8em; color:#666; border-top:1px solid #eee; padding-top:5px;">
                        Chart Params: ${params.map(p => `${p.label}=${p.val}`).join(' | ')}
                    </div>
                `;
            }
            if (item.design) {
                statsHtml += `
                    <div style="grid-column: span 2; background: #e8f5e9; color: #2e7d32; padding: 5px; text-align: center; border: 1px solid #66bb6a; border-radius: 4px; margin-top:5px;">
                        <strong>Design Steel:</strong> ${item.design.mainInfo || 'PASS'}
                    </div>
                `;

                statsHtml += `
                    <div style="grid-column: span 2; margin-top:10px; border-top:1px dashed #ccc; padding-top:8px;">
                        <label style="font-size:0.85em; color:#666;">Manual ρ Override (%):</label>
                        <div style="display:flex; gap:5px; margin-top:3px;">
                            <input type="number" step="0.1" value="${item.rho_user || 0.8}" id="input-rho-${item.id}" style="width:60px; padding:2px 5px; border:1px solid #ccc; border-radius:4px;" />
                            <button onclick="overrideColumn('${item.id}')" style="background:#2196f3; color:white; border:none; padding:2px 10px; border-radius:4px; font-size:0.8em; cursor:pointer;">Update</button>
                        </div>
                    </div>
                `;
            }
        } else if (type === 'Foundation') {
            statsHtml += `
                <div><strong>Group:</strong> ${item.cols.join(' + ')}</div>
                <div><strong>Size:</strong> ${safeUI(item.L, 2)}m x ${safeUI(item.B, 2)}m</div>
                <div><strong>Depth (h):</strong> ${item.h} mm</div>
                <div><strong>Type:</strong> <span style="color:#673ab7; font-weight:bold;">${item.type}</span></div>
                <div style="grid-column: span 2; background: #ede7f6; padding: 5px; border-radius: 4px; border-left: 3px solid #673ab7; margin-top:5px;">
                     <strong>Reinforcement:</strong> ${item.reinforcement}
                </div>
            `;
        } else if (type === 'Stair') {
            statsHtml += `
                <div><strong>Risers:</strong> ${Math.round((item.L || 3.0) / 0.175)} @${safeUI(item.R, 1)}mm</div>
                <div><strong>Going (G):</strong> ${safeUI(item.G, 1)}mm</div>
                <div><strong>Waist (h):</strong> ${item.h} mm</div>
                <div><strong>Eff. Span (L):</strong> ${safeUI(item.L, 2)} m</div>
                <div style="grid-column:span 2; color:#e63946; background:#fff1f0; padding:5px; border:1px solid #ffa39e; border-radius:4px; margin-top:5px;">
                    <strong>Steel:</strong> ${item.design?.mainInfo || 'TBD'} + ${item.design?.distInfo || 'Y10@250'}
                </div>
            `;
        }
        statsHtml += `</div>`;

        let logsHtml = `<div class="calc-logs">`;

        // Add Technical Compliance Summary Box
        logsHtml += `
            <div style="background: #fff8e1; border: 1px solid #ffe082; border-radius: 8px; padding: 12px; margin-bottom: 15px; font-size: 0.9em;">
                <h4 style="margin: 0 0 8px 0; color: #f57c00; border-bottom: 1px solid #ffd54f; padding-bottom: 5px;">📜 BS 8110:1997 Compliance Summary</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; color: #5d4037;">
                    ${type === 'Slab' ? `
                        <div>• Moment: ${item.isTwoWay ? 'Table 3.14 Coeffs' : 'User One-Way Formula'}</div>
                        <div>• Shear: table 3.8 (v < vc)</div>
                        <div>• Deflection: Modification Factors</div>
                        <div>• Coverage: Cl 3.1.2.4 BS 8110</div>
                    ` : type === 'Column' ? `
                        <div>• Type: ${item.designCase || 'Axial/Uniaxial'}</div>
                        <div>• Slenderness: ${item.isSlender ? 'Cl 3.8.4' : 'Cl 3.8.3'}</div>
                        <div>• Steel %: 0.4% - 6.0% (Limit)</div>
                        <div>• Concrete: fcu=${report._meta.settings?.fcu || 25} N/mm²</div>
                    ` : type === 'Stair' ? `
                        <div>• Spanning: Longitudinal</div>
                        <div>• Deflection: L/d <= Allowable</div>
                        <div>• Strength: 0.95fy Lever Arm</div>
                        <div>• Steel: High Yield (fy=${report._meta.settings?.fy || 460})</div>
                    ` : type === 'Foundation' ? `
                        <div>• Sizing: Service Load (q &lt; q_allow)</div>
                        <div>• Design: Ultimate Load (1.4G+1.6Q)</div>
                        <div>• Shear: 1.0d (Face) & Punching</div>
                        <div>• Bending: Linear/Cantilever Theory</div>
                    ` : `
                        <div>• Section: Rectangular/Flanged</div>
                        <div>• Analysis: Moment Distribution</div>
                        <div>• Design: Single/Double Reinforcement</div>
                        <div>• Code: BS 8110-1:1997 Part 1</div>
                    `}
                </div>
            </div>
        `;

        logsHtml += `<h4>Calculation Steps / Detailed Working:</h4><ul>`;
        if (type === 'Slab') {
            logsHtml += `<div style="margin:10px 0; background:white; padding:10px; border-radius:4px; text-align:center;">${svgGenerator.drawSlabDetail(item.lx, item.ly, item.panelIndex)}</div>`;
            (item?.logs || []).forEach(log => logsHtml += `<li>${log}</li>`);
            if (item.design && item.design.moments) {
                logsHtml += `<div style="margin-top:15px; background:#f9f9f9; padding:10px; border-radius:4px; font-family:monospace;">
                    ${item.design.moments.map(m => `<div><strong>${m.id}:</strong> M=${safeUI(m.M, 2)}kNm -> ${m.provided}</div>`).join('')}
                </div>`;
            }
        } else if (type === 'Column') {
            logsHtml += `<div style="margin:10px 0; background:white; padding:10px; border-radius:4px; text-align:center;">${svgGenerator.drawColumnSection(item.dim?.b, item.dim?.h, item.design?.mainInfo, "Y8 @ 200")}</div>`;
            (item?.logs || []).forEach(log => logsHtml += `<li>${log}</li>`);
        } else if (type === 'Stair') {
            logsHtml += `<div style="margin:10px 0; background:white; padding:10px; border-radius:4px;">${svgGenerator.drawStairSection(item)}</div>`;
            (item.design?.logs || []).forEach(log => logsHtml += `<li>${log}</li>`);
        } else if (type === 'Beam') {
            const pLoads = (item.shapes || []).filter(s => s.type === 'point').map(s => ({ P: s.val, a: s.start }));
            const slabShapes = (item.shapes || []).filter(s => s.type === 'slab-tri' || s.type === 'slab-trap');

            logsHtml += `<div style="margin-top:15px; padding:10px; background:white; border-radius:8px;">
                ${svgGenerator.drawSlabLoadGeometry(item.span, slabShapes)}
                ${svgGenerator.drawBeamLoading(item.span, parseFloat(item.totalForce) / parseFloat(item.span) || 0, pLoads)}
            </div>`;
            (item?.detailLogs || []).forEach(log => logsHtml += `<li>${log}</li>`);
        } else if (type === 'Foundation') {
            logsHtml += `
                <div style="margin:15px 0; text-align:center; background:white; padding:15px; border-radius:8px; border:1px solid #eee;">
                    ${svgGenerator.drawFootingSection(item.width_mm || 1200, item.depth_mm || 450)}
                    <div style="font-size:11px; color:#999; margin-top:5px;">Professional Footing Section Detail</div>
                </div>
            `;
            (item?.logs || []).forEach(log => logsHtml += `<li>${log}</li>`);
        } else {
            (item?.detailLogs || []).forEach(log => logsHtml += `<li>${log}</li>`);
        }
        logsHtml += `</ul></div>`;

        card.innerHTML = headerHtml + statsHtml + logsHtml;
        section.appendChild(card);
    });
    content.appendChild(section);
}

window.overrideColumn = function (colId) {
    if (!window.currentReport) return;
    const input = document.getElementById(`input-rho-${colId}`);
    const rho = parseFloat(input.value);

    if (isNaN(rho) || rho < 0.4 || rho > 6.0) {
        alert("Please enter a valid Steel % between 0.4 and 6.0");
        return;
    }

    const col = window.currentReport.columns.find(c => c.id === colId);
    if (!col) return;

    const settings = window.currentReport._meta?.settings || { fcu: 25, fy: 460 };
    const b = col.dim?.b || 230;
    const h = col.dim?.h || 230;
    const As_req = (rho / 100) * b * h;

    col.design.mainInfo = `Manual: ${safeUI(rho, 1)}% (${safeUI(As_req, 0)} mm²)`;
    col.rho_user = rho;
    renderReport(window.currentReport);
};

export { initReport, renderReport };
