/**
 * svgGenerator.js
 * Utility for generating professional structural engineering diagrams.
 */

export const svgGenerator = {
    /**
     * Draw a beam section with reinforcement.
     * Supports T, L, and Rectangular shapes with professional dimensioning.
     */
    drawBeamSection(b = 230, h = 450, mainBars = "3Y16", links = "Y8 @ 200", beamType = 'Rect', hf = 150, bf = 0) {
        if (!mainBars) mainBars = "3Y16";
        if (!links) links = "Y8 @ 200";
        const padding = 70;

        const actual_bf = (beamType === 'T' || beamType === 'L') ? (bf || b + 300) : b;
        const width = actual_bf + 2 * padding;
        const height = h + 2 * padding;

        const cover = 30; // Standard nominal cover
        const linkDiam = 8;

        let svg = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="max-height:280px; background:#fff; border:1px solid #eee; border-radius:8px; font-family: 'Inter', sans-serif;">`;

        svg += `<defs>
            <marker id="arrow" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 Z" fill="#999" />
            </marker>
        </defs>`;

        // 1. Concrete Shape
        let path = "";
        const webX = padding + (actual_bf - b) / 2;

        if (beamType === 'T') {
            path = `M ${padding} ${padding} L ${padding + actual_bf} ${padding} L ${padding + actual_bf} ${padding + hf} 
                    L ${webX + b} ${padding + hf} L ${webX + b} ${padding + h} L ${webX} ${padding + h} 
                    L ${webX} ${padding + hf} L ${padding} ${padding + hf} Z`;
        } else if (beamType === 'L') {
            path = `M ${padding} ${padding} L ${padding + actual_bf} ${padding} L ${padding + actual_bf} ${padding + hf}
                    L ${padding + b} ${padding + hf} L ${padding + b} ${padding + h} L ${padding} ${padding + h} Z`;
        } else {
            path = `M ${padding} ${padding} L ${padding + b} ${padding} L ${padding + b} ${padding + h} L ${padding} ${padding + h} Z`;
        }
        svg += `<path d="${path}" fill="#f9f9f9" stroke="#333" stroke-width="2.5" />`;

        // 2. Links (Stirrups)
        const stirrupX = (beamType === 'L') ? padding + cover : webX + cover;
        const stirrupY = padding + cover;
        const stirrupW = b - 2 * cover;
        const stirrupH = h - 2 * cover;
        svg += `<rect x="${stirrupX}" y="${stirrupY}" width="${stirrupW}" height="${stirrupH}" fill="none" stroke="#666" stroke-width="2" rx="4" />`;

        // 3. Reinforcement
        const match = mainBars.match(/(\d+)[TY](\d+)/);
        const count = match ? parseInt(match[1]) : 3;
        const diameter = match ? parseInt(match[2]) : 16;
        const barRadius = diameter / 2;
        const drawBar = (x, y, r, color = "#d32f2f") => {
            svg += `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" stroke="#000" stroke-width="0.8" />`;
        };

        const startX = stirrupX + linkDiam + barRadius + 4;
        const endX = stirrupX + stirrupW - linkDiam - barRadius - 4;
        const bottomY = padding + h - cover - linkDiam - barRadius - 4;
        const topY = stirrupY + linkDiam + barRadius + 4;

        // Optimized Bar Layout
        if (count <= 4) {
            for (let i = 0; i < count; i++) {
                const x = (count === 1) ? (startX + endX) / 2 : startX + i * ((endX - startX) / (count - 1));
                drawBar(x, bottomY, barRadius);
            }
        } else {
            const row1 = Math.ceil(count / 2);
            const row2 = count - row1;
            for (let i = 0; i < row1; i++) drawBar(startX + i * ((endX - startX) / (row1 - 1)), bottomY, barRadius);
            for (let i = 0; i < row2; i++) drawBar(startX + i * ((endX - startX) / (row2 - 1)), bottomY - diameter - 12, barRadius);
        }

        // Hanger bars (Standard Fixed)
        drawBar(startX, topY, 4.5, "#999");
        drawBar(endX, topY, 4.5, "#999");

        // 4. Detailed Dimensioning
        const dim = (x1, y1, x2, y2, txt, off, isV = false) => {
            if (isV) {
                svg += `<line x1="${x1 - off}" y1="${y1}" x2="${x1 - off}" y2="${y2}" stroke="#aaa" stroke-width="1" marker-start="url(#arrow)" marker-end="url(#arrow)" />`;
                svg += `<text x="${x1 - off - 10}" y="${(y1 + y2) / 2}" font-size="11" text-anchor="middle" fill="#666" transform="rotate(-90, ${x1 - off - 10}, ${(y1 + y2) / 2})">${txt}</text>`;
            } else {
                svg += `<line x1="${x1}" y1="${y1 - off}" x2="${x2}" y2="${y1 - off}" stroke="#aaa" stroke-width="1" marker-start="url(#arrow)" marker-end="url(#arrow)" />`;
                svg += `<text x="${(x1 + x2) / 2}" y="${y1 - off - 8}" font-size="11" text-anchor="middle" fill="#666">${txt}</text>`;
            }
        };

        dim(padding, padding, padding + actual_bf, padding, `bf=${actual_bf.toFixed(0)}`, 25);
        if (beamType !== 'Rect') {
            dim(webX, padding + h, webX + b, padding + h, `bw=${b}`, -30);
            dim(padding + actual_bf, padding, padding + actual_bf, padding + hf, `hf=${hf}`, -20, true);
        } else {
            dim(padding, padding + h, padding + b, padding + h, `b=${b}`, -30);
        }
        dim(padding, padding, padding, padding + h, `h=${h}`, 30, true);

        // Metadata
        svg += `<text x="${width / 2}" y="${height - 15}" font-size="13" font-weight="bold" text-anchor="middle" fill="#222">${beamType} GROUP SECTION: ${mainBars} (Bottom) + ${links}</text>`;
        svg += `</svg>`;
        return svg;
    },

    /**
     * Draw a Column Section with main reinforcement and links.
     */
    drawColumnSection(b = 230, h = 230, mainBars = "4Y16", links = "Y8 @ 200") {
        const padding = 60;
        const width = b + 2 * padding;
        const height = h + 2 * padding;
        const cover = 30;
        const linkDiam = 8;

        let svg = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="max-height:240px; background:#fff; border:1px solid #eee; border-radius:8px; font-family: 'Inter', sans-serif;">`;

        // 1. Concrete
        svg += `<rect x="${padding}" y="${padding}" width="${b}" height="${h}" fill="#fcfcfc" stroke="#333" stroke-width="2.5" />`;

        // 2. Links
        const sX = padding + cover;
        const sY = padding + cover;
        const sW = b - 2 * cover;
        const sH = h - 2 * cover;
        svg += `<rect x="${sX}" y="${sY}" width="${sW}" height="${sH}" fill="none" stroke="#666" stroke-width="2" rx="4" />`;

        // 3. Reinforcement
        const match = mainBars.match(/(\d+)[TY](\d+)/);
        const count = match ? parseInt(match[1]) : 4;
        const diameter = match ? parseInt(match[2]) : 16;
        const barRadius = Math.max(4, diameter / 4); // Visual scale

        const innerPadding = linkDiam + 2;
        const xL = sX + innerPadding;
        const xR = sX + sW - innerPadding;
        const yT = sY + innerPadding;
        const yB = sY + sH - innerPadding;

        const drawBar = (x, y) => svg += `<circle cx="${x}" cy="${y}" r="${barRadius}" fill="#d32f2f" stroke="#000" stroke-width="0.5" />`;

        // Layout: corners first
        drawBar(xL, yT); drawBar(xR, yT);
        drawBar(xL, yB); drawBar(xR, yB);

        if (count >= 6) {
            // Mid bars
            drawBar((xL + xR) / 2, yT);
            drawBar((xL + xR) / 2, yB);
        }
        if (count >= 8) {
            drawBar(xL, (yT + yB) / 2);
            drawBar(xR, (yT + yB) / 2);
        }

        svg += `<text x="${width / 2}" y="${height - 15}" font-size="13" font-weight="bold" text-anchor="middle" fill="#222">COLUMN: ${b}x${h} | ${mainBars} + ${links}</text>`;
        svg += `</svg>`;
        return svg;
    },

    /**
     * Draw Slab Detail with professional continuity markers.
     */
    drawSlabDetail(lx, ly, panelTypeIndex) {
        const w = 320, h = 240, pad = 60;
        let svg = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="max-height:240px; background:#fff; border:1px solid #ddd; border-radius:10px; font-family: sans-serif;">`;

        const ratio = ly / lx;
        const dLx = 200, dLy = Math.min(140, dLx * ratio);
        const x1 = (w - dLx) / 2, y1 = (h - dLy) / 2;

        const types = [
            { t: 1, b: 1, l: 1, r: 1, n: "Interior Panel" },
            { t: 1, b: 1, l: 1, r: 0, n: "One Short Edge Disc." },
            { t: 0, b: 1, l: 1, r: 1, n: "One Long Edge Disc." },
            { t: 0, b: 1, l: 1, r: 0, n: "Two Adj. Edges Disc." },
            { t: 1, b: 1, l: 0, r: 0, n: "Two Short Edges Disc." },
            { t: 0, b: 0, l: 1, r: 1, n: "Two Long Edges Disc." },
            { t: 0, b: 0, l: 1, r: 0, n: "Three Edges Disc. (One Long Cont.)" },
            { t: 0, b: 0, l: 0, r: 1, n: "Three Edges Disc. (One Short Cont.)" },
            { t: 0, b: 0, l: 0, r: 0, n: "All Edges Discontinuous" }
        ];
        const p = types[panelTypeIndex] || types[8];

        svg += `<rect x="${x1}" y="${y1}" width="${dLx}" height="${dLy}" fill="#fcfcfc" stroke="#444" stroke-width="2" />`;

        // Draw Edge Continuity (Hatching)
        const edge = (ax, ay, bx, by, cont) => {
            if (cont) {
                // Simplified Hatching: Just Thick Red Line to keep it neat
                svg += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="#d32f2f" stroke-width="5" />`;
            } else {
                svg += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="#666" stroke-width="2" stroke-dasharray="8,4" />`;
            }
        };

        edge(x1, y1, x1 + dLx, y1, p.t);
        edge(x1, y1 + dLy, x1 + dLx, y1 + dLy, p.b);
        edge(x1, y1, x1, y1 + dLy, p.l);
        edge(x1 + dLx, y1, x1 + dLx, y1 + dLy, p.r);

        // SYMBOLIC ARROWS (Requested replacement for yield lines)
        // Two-way: Cross. One-way: Single arrow along span.

        // Determine aspect and type
        // One-way detection: ratio > 2.0 OR explicit type check?
        // We rely on 'panelTypeIndex'. But strict one-way depends on load distribution logic not just continuity.
        // Heuristic: If ratio > 2, draw One-way. Else Two-way.
        // Actually assume Two-way unless Ratio suggests One-way (BS 8110 > 2.0).

        const cx = x1 + dLx / 2;
        const cy = y1 + dLy / 2;
        const arrowLen = Math.min(dLx, dLy) * 0.6;

        const arrow = (x1, y1, x2, y2) => {
            // Line with double arrowheads
            return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1976D2" stroke-width="2" marker-start="url(#arrowS)" marker-end="url(#arrowS)" />`;
        };

        if (ratio > 2.0 || ratio < 0.5) {
            // ONE WAY
            // Arrow parallel to SHORT span.
            if (dLx < dLy) {
                // Short span is X. Horizontal Arrow.
                svg += arrow(cx - arrowLen / 2, cy, cx + arrowLen / 2, cy);
            } else {
                // Short span is Y. Vertical Arrow.
                svg += arrow(cx, cy - arrowLen / 2, cx, cy + arrowLen / 2);
            }
        } else {
            // TWO WAY (Cross)
            // Horizontal
            const armX = Math.min(dLx, dLy) * 0.35; // keep small enough to fit inside
            svg += arrow(cx - armX, cy, cx + armX, cy);
            // Vertical 
            svg += arrow(cx, cy - armX, cx, cy + armX);
        }

        svg += `<text x="${x1 + dLx / 2}" y="${y1 - 15}" font-size="14" font-weight="bold" text-anchor="middle">Lx = ${(lx ?? 0).toFixed(2)}m</text>`;
        svg += `<text x="${x1 - 20}" y="${y1 + dLy / 2}" font-size="14" font-weight="bold" text-anchor="middle" transform="rotate(-90, ${x1 - 20}, ${y1 + dLy / 2})">Ly = ${(ly ?? 0).toFixed(2)}m</text>`;
        svg += `<text x="${w / 2}" y="${h - 15}" font-size="12" font-weight="bold" text-anchor="middle" fill="#d32f2f">${p.n}</text>`;

        svg += `</svg>`;
        return svg;
    },

    /**
     * Loading Diagram (Professional Arrowheads)
     */
    drawBeamLoading(L_m, udl, pLoads = []) {
        const w = 400, h = 150, pad = 40;
        let svg = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:auto; background:#fff; padding:10px;">`;
        const bY = h - 40;

        svg += `<line x1="${pad}" y1="${bY}" x2="${w - pad}" y2="${bY}" stroke="#333" stroke-width="6" stroke-linecap="round" />`;

        const nA = 15;
        for (let i = 0; i <= nA; i++) {
            const x = pad + i * ((w - 2 * pad) / nA);
            svg += `<line x1="${x}" y1="${bY - 40}" x2="${x}" y2="${bY - 10}" stroke="#c62828" stroke-width="1.5" marker-end="url(#arrowhead-red)" />`;
        }
        svg += `<line x1="${pad}" y1="${bY - 40}" x2="${w - pad}" y2="${bY - 40}" stroke="#c62828" stroke-width="2" />`;
        svg += `<text x="${w / 2}" y="${bY - 50}" font-size="12" font-weight="bold" text-anchor="middle" fill="#c62828">w = ${(udl ?? 0).toFixed(2)} kN/m</text>`;

        pLoads.forEach(p => {
            const x = pad + (p.a / L_m) * (w - 2 * pad);
            svg += `<line x1="${x}" y1="${bY - 70}" x2="${x}" y2="${bY - 10}" stroke="#283593" stroke-width="4" marker-end="url(#arrowhead-blue)" />`;
            svg += `<text x="${x}" y="${bY - 75}" font-size="12" font-weight="bold" text-anchor="middle" fill="#283593">${p.P}kN</text>`;
        });

        const sup = (x) => svg += `<path d="M ${x - 10} ${bY + 15} L ${x} ${bY} L ${x + 10} ${bY + 15} Z" fill="#333" />`;
        sup(pad); sup(w - pad);

        svg += `<defs>
            <marker id="arrowhead-red" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><polygon points="0 0, 6 3, 0 6" fill="#c62828" /></marker>
            <marker id="arrowhead-blue" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><polygon points="0 0, 8 4, 0 8" fill="#283593" /></marker>
        </defs>`;
        svg += `</svg>`;
        return svg;
    },

    drawDiagram(p, L, type) {
        if (!p || !p.length) return "";
        const w = 400, h = 160, pad = 40; // Smaller size
        const bY = h / 2; // zero axis

        let svg = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:auto; background:#fcfdff; border-radius:8px; border:1px solid #e1e9f5;">`;

        const vals = p.map(pt => type === 'BMD' ? pt.moment : pt.shear);
        const maxAbs = Math.max(0.1, ...vals.map(v => Math.abs(v)));
        const scaleY = (bY - pad) / maxAbs;

        // --- 1. COORDINATE HELPERS ---
        const mapX = (x) => pad + (x / L) * (w - 2 * pad);

        // PHYSICS RULE: Invert Y (Positive goes UP) for SFD.
        // BUT USER RULE: BMD Sagging (Positive) must be drawn DOWNWARDS.
        const mapY = (val) => {
            if (type === 'BMD') return bY + (val * scaleY); // Positive Sagging = DOWN
            return bY - (val * scaleY); // Positive Shear = UP
        };

        // --- 2. ZERO LINE FIRST ---
        svg += `<line x1="${pad}" y1="${bY}" x2="${w - pad}" y2="${bY}" stroke="#333" stroke-width="1" stroke-dasharray="4,2" opacity="0.5" />`;

        // --- 3. DIAGRAM PATH ---
        let path = "";
        p.forEach((pt, i) => {
            const x = mapX(pt.x);
            const v = type === 'BMD' ? pt.moment : pt.shear;
            const y = mapY(v);
            if (i === 0) path = `M ${x.toFixed(2)} ${y.toFixed(2)}`;
            else path += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
        });

        const startX = mapX(p[0].x);
        const endX = mapX(p[p.length - 1].x);
        const fillPath = `M ${startX.toFixed(2)} ${bY} ${path.substring(1)} L ${endX.toFixed(2)} ${bY} Z`;

        svg += `<path d="${fillPath}" fill="${type === 'BMD' ? 'rgba(25,118,210,0.1)' : 'rgba(211, 47, 47, 0.08)'}" stroke="none" />`;
        svg += `<path d="${path}" fill="none" stroke="${type === 'BMD' ? '#1565C0' : '#d32f2f'}" stroke-width="2.5" stroke-linejoin="round" />`;

        // --- 4. LABELS ---
        let maxIdx = 0, minIdx = 0;
        vals.forEach((v, i) => {
            if (v > vals[maxIdx]) maxIdx = i;
            if (v < vals[minIdx]) minIdx = i;
        });

        const drawLabel = (idx, color) => {
            const pt = p[idx];
            const x = mapX(pt.x);
            const v = type === 'BMD' ? pt.moment : pt.shear;
            const y = mapY(v);
            // Label offset depends on direction
            const isUp = (type === 'BMD') ? v < 0 : v > 0;
            const labelY = isUp ? y - 10 : y + 15;
            svg += `<text x="${x}" y="${labelY}" font-size="10" font-weight="bold" text-anchor="middle" fill="${color}">${v.toFixed(1)}</text>`;
        };

        if (Math.abs(vals[maxIdx]) > 0.1) drawLabel(maxIdx, type === 'BMD' ? '#0D47A1' : '#B71C1C');
        if (Math.abs(vals[minIdx]) > 0.1 && maxIdx !== minIdx) drawLabel(minIdx, type === 'BMD' ? '#0D47A1' : '#B71C1C');

        svg += `<text x="${w / 2}" y="${h - 8}" font-size="11" font-weight="900" text-anchor="middle" fill="#222" style="text-transform:uppercase;">${type === 'BMD' ? 'Bending Moment' : 'Shear Force'} (${type === 'BMD' ? 'kNm' : 'kN'})</text>`;

        svg += `</svg>`;
        return svg;
    },

    drawSlabTransfer(s) {
        const w = 120, h = 80, pad = 10;
        let svg = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="max-width:120px; background:#fff; border:1px solid #ddd; margin:5px;">`;
        const g = s.geom;
        if (g.shape === 'triangle') svg += `<path d="M ${pad} ${h - pad} L ${w / 2} ${pad} L ${w - pad} ${h - pad} Z" fill="#FFF9C4" stroke="#FBC02D" stroke-width="2" />`;
        else if (g.shape === 'trapezium') svg += `<path d="M ${pad} ${h - pad} L ${pad + 20} ${pad} L ${w - pad - 20} ${pad} L ${w - pad} ${h - pad} Z" fill="#E1F5FE" stroke="#0288D1" stroke-width="2" />`;
        else if (g.shape === 'rectangle') svg += `<rect x="${pad}" y="${pad}" width="${w - 2 * pad}" height="${h - 2 * pad}" fill="#E8F5E9" stroke="#4CAF50" stroke-width="2" />`;
        svg += `</svg>`;
        return svg;
    },

    /**
     * Draw the geometric slab load contribution (Yield Lines) on a beam.
     */
    drawSlabLoadGeometry(L_m, shapes = []) {
        const w = 400, h = 80, pad = 40; // Reduced height
        let svg = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:auto; background:#fafafa; border-radius:8px; margin-bottom:5px;">`;

        // Beam Line
        const bY = h - 20;
        svg += `<line x1="${pad}" y1="${bY}" x2="${w - pad}" y2="${bY}" stroke="#333" stroke-width="4" stroke-linecap="round" />`;

        shapes.forEach((s, idx) => {
            if (s.type === 'slab-tri' || s.type === 'slab-trap') {
                const lx = s.geom ? s.geom.lx : 4.0;
                const a = lx / 2;
                const visualA = (a / L_m) * (w - 2 * pad);
                const visualL = (w - 2 * pad);
                const peakY = bY - 40;

                let path = "";
                const opacity = 0.15 + (idx * 0.05); // Vary opacity if multiple
                if (s.type === 'slab-tri') {
                    path = `M ${pad} ${bY} L ${pad + visualL / 2} ${peakY} L ${w - pad} ${bY} Z`;
                } else {
                    path = `M ${pad} ${bY} L ${pad + visualA} ${peakY} L ${w - pad - visualA} ${peakY} L ${w - pad} ${bY} Z`;
                }
                svg += `<path d="${path}" fill="rgba(33, 150, 243, ${opacity})" stroke="#1976D2" stroke-width="1.5" stroke-dasharray="4,2" />`;
            }
        });

        svg += `<text x="${w / 2}" y="${h - 5}" font-size="10" font-weight="900" text-anchor="middle" fill="#555" style="text-transform:uppercase;">Load Area Geometry</text>`;
        svg += `</svg>`;
        return svg;
    },
    /**
     * Draw a Stair Section with reinforcement.
     * Shows generic profile with dims.
     */
    drawStairSection(design) {
        if (!design) return '';

        const width = 600;
        const height = 400;
        const p = 50;

        // Scale factors: Visual representation only
        const R = design.R || 170;
        const G = design.G || 250;
        const h = design.h || 150;
        const numSteps = design.numSteps || 10;

        const scale = 0.35; // Zoomed out for full profile
        const tanA = R / G;
        const cosA = Math.cos(Math.atan(tanA));
        const waistVert = h / cosA;

        let svg = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="background:#fff; border:1px solid #eee; border-radius:8px; font-family: 'Inter', sans-serif;">`;
        svg += `<defs>
            <marker id="arrowS" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                <path d="M 0 0 L 6 3 L 0 6 Z" fill="#666" />
            </marker>
        </defs>`;

        // 1. Draw Steps (Sawtooth)
        let pathTop = `M ${p} ${height - p}`;
        let pathBot = `M ${p} ${height - p + waistVert}`; // Bottom edge start? No, perpendicular thickness h.
        // Actually simplest to draw polygon points

        // Start bottom-left
        const startX = p;
        const startY = height - p;

        // Steps loop
        let stepsPath = "";
        let currentX = startX;
        let currentY = startY;

        // Draw 5 steps up
        for (let i = 0; i < numSteps; i++) {
            // Up R
            currentY -= R * scale;
            stepsPath += `L ${currentX} ${currentY}`;
            // Right G
            currentX += G * scale;
            stepsPath += `L ${currentX} ${currentY}`;
        }

        // Final landing cut
        const endX = currentX + 50;
        stepsPath += `L ${endX} ${currentY}`;

        // Bottom soffit
        // Slope line
        const totalRise = R * numSteps;
        const totalGo = G * numSteps;
        const slopeY = startY + waistVert * scale; // Start deeper? 
        // Logic: Soffit line is parallel to nosing line, offset by h/cosA vertically

        // Nosing line starts at (startX, startY) - actually step 1 toe.
        // Let's trace back from end

        // Correct closed polygon for concrete
        const pts = [];
        let cx = startX;
        let cy = startY;
        pts.push(`${cx},${cy}`); // Toe 1

        for (let i = 0; i < numSteps; i++) {
            cy -= R * scale;
            pts.push(`${cx},${cy}`); // Riser top
            cx += G * scale;
            pts.push(`${cx},${cy}`); // Tread end
        }
        cx += 40; // Landing ext
        pts.push(`${cx},${cy}`);

        // Go down waist thickness
        cy += h * scale; // Approx vertical drop at landing
        pts.push(`${cx},${cy}`);

        // Go back down slope
        // Slope angle
        const dy = (R * numSteps) * scale;
        const dx = (G * numSteps) * scale;
        // slope line
        const soffitX = startX + 40; // Landing ext left
        const soffitY = startY + h * scale; // landing ext left vertical drop

        // Just cheat slightly for visuals: Draw line back to start offset
        pts.push(`${startX},${startY + waistVert * scale}`);
        pts.push(`${startX},${startY}`);

        svg += `<path d="M ${pts.join(' L ')} Z" fill="#f5f5f5" stroke="#333" stroke-width="2" />`;

        // 2. Reinforcement
        // Red line offset from bottom
        const cover = 25 * scale;
        const rebarStart = `${startX + 20},${startY + waistVert * scale - cover}`;
        const rebarEnd = `${cx - 20},${cy - cover}`;
        svg += `<path d="M ${rebarStart} L ${rebarEnd}" stroke="#e63946" stroke-width="4" fill="none" />`;

        // Dist bars (dots)
        const numDist = 6;
        for (let i = 1; i < numDist; i++) {
            const bx = startX + (cx - startX) * (i / numDist);
            const by = (startY + waistVert * scale - cover) - (dy + 20) * (i / numDist); // Rough slope
            svg += `<circle cx="${bx}" cy="${by}" r="3" fill="#333" />`;
        }

        // 3. Annotations
        // Riser
        svg += `<text x="${startX - 15}" y="${startY - R * scale / 2}" text-anchor="end" font-size="12" fill="#666">R=${R}</text>`;

        // Tread
        svg += `<text x="${startX + G * scale / 2}" y="${startY - R * scale - 5}" text-anchor="middle" font-size="12" fill="#666">G=${G}</text>`;

        // Waist
        svg += `<text x="${startX + 100}" y="${startY + 80}" text-anchor="middle" font-size="12" fill="#666">h=${h}</text>`;

        // Main Bars Label
        svg += `<text x="${width / 2}" y="${height - 20}" text-anchor="middle" font-size="14" font-weight="bold" fill="#e63946">Main: ${design.design?.mainInfo || 'TBD'}</text>`;

        svg += `</svg>`;
        return svg;
    },

    /**
     * Draw a professional Footing Section SVG.
     */
    drawFootingSection(B = 1200, D = 450) {
        const w = 400, h = 300;
        const pad = 50;
        let svg = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="max-height:280px; background:#fff; border:1px solid #eee; border-radius:8px; font-family: 'Inter', sans-serif;">`;

        const fW = 240; // Footing visual width
        const fH = 80;  // Footing visual depth
        const cW = 50;  // Column visual width

        const fX = (w - fW) / 2;
        const fY = h - pad - fH;
        const cX = (w - cW) / 2;
        const cY = pad;

        // 1. Concrete (Footing + Column)
        svg += `<path d="M ${fX} ${fY} L ${fX + fW} ${fY} L ${fX + fW} ${fY + fH} L ${fX} ${fY + fH} Z" fill="#f0f0f0" stroke="#333" stroke-width="2" />`;
        svg += `<path d="M ${cX} ${cY} L ${cX + cW} ${cY} L ${cX + cW} ${fY} L ${cX} ${fY} Z" fill="#f0f0f0" stroke="#333" stroke-width="2" />`;

        // 2. Reinforcement
        const cover = 10;
        // Bottom Mesh
        svg += `<line x1="${fX + cover}" y1="${fY + fH - cover}" x2="${fX + fW - cover}" y2="${fY + fH - cover}" stroke="#d32f2f" stroke-width="3" />`;
        // Cross bars (dots)
        for (let i = 0; i < 6; i++) {
            svg += `<circle cx="${fX + cover + 10 + i * 40}" cy="${fY + fH - cover - 5}" r="2" fill="#d32f2f" />`;
        }
        // Column Starter Bars
        svg += `<path d="M ${cX + 15} ${cY} L ${cX + 15} ${fY + fH - cover - 5} L ${fX + 50} ${fY + fH - cover - 5}" fill="none" stroke="#1976D2" stroke-width="2" />`;
        svg += `<path d="M ${cX + cW - 15} ${cY} L ${cX + cW - 15} ${fY + fH - cover - 5} L ${fX + fW - 50} ${fY + fH - cover - 5}" fill="none" stroke="#1976D2" stroke-width="2" />`;

        // 3. Annotations
        const dim = (x1, y1, x2, y2, txt, off, isV = false) => {
            svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#999" stroke-width="1" marker-start="url(#arrowSD)" marker-end="url(#arrowSD)" />`;
            const tx = isV ? x1 - 10 : (x1 + x2) / 2;
            const ty = isV ? (y1 + y2) / 2 : y1 - 10;
            svg += `<text x="${tx}" y="${ty}" font-size="11" text-anchor="middle" fill="#666" ${isV ? `transform="rotate(-90, ${tx}, ${ty})"` : ""}>${txt}</text>`;
        };

        svg += `<defs><marker id="arrowSD" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M 0 0 L 6 3 L 0 6 Z" fill="#999" /></marker></defs>`;

        dim(fX, fY + fH + 20, fX + fW, fY + fH + 20, `B = ${B}mm`, 0);
        dim(fX - 20, fY, fX - 20, fY + fH, `D = ${D}mm`, 0, true);

        svg += `<text x="${w / 2}" y="${h - 10}" font-size="13" font-weight="bold" text-anchor="middle" fill="#222">FOOTING SECTION DETAIL</text>`;
        svg += `</svg>`;
        return svg;
    }
};
