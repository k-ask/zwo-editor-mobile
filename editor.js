let chart;
let segments = [];

// Zwift Power Zones
const ZONES = [
    { limit: 0.60, color: '#7f7f7f', bg: 'rgba(127, 127, 127, 0.2)' },
    { limit: 0.76, color: '#3284c9', bg: 'rgba(50, 132, 201, 0.2)' },
    { limit: 0.90, color: '#5aca5a', bg: 'rgba(90, 202, 90, 0.2)' },
    { limit: 1.05, color: '#ffca28', bg: 'rgba(255, 202, 40, 0.2)' },
    { limit: 1.19, color: '#ff6924', bg: 'rgba(255, 105, 36, 0.2)' },
    { limit: 99.9, color: '#ff3737', bg: 'rgba(255, 55, 55, 0.2)' }
];

function getZone(power) {
    for (let z of ZONES) if (power < z.limit) return z;
    return ZONES[ZONES.length - 1];
}

// Time Helpers
function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${String(sec).padStart(2, '0')}`;
}

function parseTime(input) {
    if (!input) return 0;
    const parts = input.toString().split(':');
    return parts.length === 2 ? parseInt(parts[0]) * 60 + parseInt(parts[1]) : parseInt(input);
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        if (typeof Chart !== 'undefined') {
            initChart();
        } else {
            console.warn('Chart.js not loaded');
            document.getElementById('graphContainer').innerHTML = "<div style='padding:20px;text-align:center;color:#666;'>Graph unavailable (offline)</div>";
        }
    } catch (e) {
        console.error("Chart init failed", e);
    }

    document.getElementById('addBtn').addEventListener('click', showModal);
    document.getElementById('loadBtn').addEventListener('click', () => document.getElementById('fileInput').click());
    document.getElementById('fileInput').addEventListener('change', loadFile);
    document.getElementById('saveBtn').addEventListener('click', saveWorkout);

    // Initial Defaults
    addSegment('Warmup', { duration: 600, power_low: 0.25, power_high: 0.75 });
    addSegment('SteadyState', { duration: 300, power: 0.90 });

    try {
        updateUI();
    } catch (e) {
        console.error("UI update failed", e);
    }
});

function showModal() { document.getElementById('typeModal').style.display = 'flex'; }
function closeModal() { document.getElementById('typeModal').style.display = 'none'; }
function handleAdd(type, defaults = {}) {
    addSegment(type, defaults);
    closeModal();
}

function initChart() {
    const ctx = document.getElementById('workoutChart').getContext('2d');
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                data: [], borderWidth: 0, pointRadius: 0, fill: true, tension: 0, segment: {
                    backgroundColor: c => {
                        const y = (c.p0.parsed.y + c.p1.parsed.y) / 2;
                        return getZone(y).color + 'cc';
                    }
                }
            }]
        },
        options: {
            animation: false, responsive: true, maintainAspectRatio: false,
            scales: {
                x: { type: 'linear', display: false },
                y: { display: false, beginAtZero: true, suggestedMax: 1.2 }
            },
            plugins: { legend: { display: false }, tooltip: { enabled: false } }
        }
    });
}

function updateUI() {
    renderSegmentsList();
    updateChart();
    updateStats();
}

function calculateTSS() {
    let totalTSS = 0;
    segments.forEach(s => {
        let durationSec = s.duration;
        let intensity = 0;

        if (s.type === 'SteadyState') {
            intensity = s.power; // already fraction of FTP
            totalTSS += (s.duration / 3600) * (intensity * intensity) * 100;
        } else if (s.type === 'IntervalsT') {
            // On segment
            let onTSS = (s.on_duration / 3600) * (s.on_power * s.on_power) * 100;
            // Off segment
            let offTSS = (s.off_duration / 3600) * (s.off_power * s.off_power) * 100;
            totalTSS += (onTSS + offTSS) * s.repeat;
        } else if (['Warmup', 'CoolDown', 'Ramp'].includes(s.type)) {
            // Approximate linear ramp TSS: integrate (start + (end-start)*t/T)^2
            // Simplification: use average power for short ramps, or exact formula
            // Exact: (1/3) * (low^2 + low*high + high^2)
            let meanSq = (Math.pow(s.power_low, 2) + s.power_low * s.power_high + Math.pow(s.power_high, 2)) / 3;
            totalTSS += (s.duration / 3600) * meanSq * 100;
        } else {
            // FreeRide etc assuming 0.5 intensity for TSS estimate? or 0
            totalTSS += (s.duration / 3600) * (0.5 * 0.5) * 100;
        }
    });
    return Math.round(totalTSS);
}


function updateStats() {
    let totalSec = 0;
    segments.forEach(s => totalSec += (s.type === 'IntervalsT') ? s.repeat * (s.on_duration + s.off_duration) : s.duration);
    document.getElementById('totalDuration').innerText = formatTime(totalSec);
    document.getElementById('totalTSS').innerText = `TSS: ${calculateTSS()}`;
}

function updateChart() {
    const data = [];
    let currentTime = 0;
    segments.forEach(s => {
        if (['Warmup', 'CoolDown', 'Ramp'].includes(s.type)) {
            data.push({ x: currentTime, y: s.power_low });
            currentTime += s.duration;
            data.push({ x: currentTime, y: s.power_high });
        } else if (s.type === 'SteadyState') {
            data.push({ x: currentTime, y: s.power });
            currentTime += s.duration;
            data.push({ x: currentTime, y: s.power });
        } else if (s.type === 'IntervalsT') {
            for (let i = 0; i < s.repeat; i++) {
                data.push({ x: currentTime, y: s.on_power });
                currentTime += s.on_duration;
                data.push({ x: currentTime, y: s.on_power });
                data.push({ x: currentTime, y: s.off_power });
                currentTime += s.off_duration;
                data.push({ x: currentTime, y: s.off_power });
            }
        } else {
            data.push({ x: currentTime, y: 0.5 });
            currentTime += s.duration;
            data.push({ x: currentTime, y: 0.5 });
        }
    });
    if (chart) {
        try {
            chart.data.datasets[0].data = data;
            chart.update();
        } catch (e) {
            console.warn("Chart update failed", e);
        }
    }
}

function addSegment(type, defaults = {}) {
    const base = { id: Date.now() + Math.random(), type, duration: 300 };
    if (type === 'Warmup' || type === 'Ramp') { base.power_low = 0.25; base.power_high = 0.75; }
    else if (type === 'CoolDown') { base.power_low = 0.75; base.power_high = 0.25; }
    else if (type === 'SteadyState') { base.power = 0.85; }
    else if (type === 'IntervalsT') { base.repeat = 5; base.on_duration = 60; base.off_duration = 60; base.on_power = 1.0; base.off_power = 0.5; base.duration = 0; }

    segments.push({ ...base, ...defaults });
    updateUI();
}

function removeSegment(id) {
    segments = segments.filter(s => s.id !== id);
    updateUI();
}

function moveSegment(id, dir) {
    const idx = segments.findIndex(s => s.id === id);
    if (idx === -1) return;
    const newIdx = idx + dir;
    if (newIdx >= 0 && newIdx < segments.length) {
        const temp = segments[idx];
        segments[idx] = segments[newIdx];
        segments[newIdx] = temp;
        updateUI();
    }
}

function updateSegment(id, field, value) {
    const s = segments.find(s => s.id === id);
    if (!s) return;
    if (field.includes('power')) s[field] = parseFloat(value) / 100;
    else if (field.includes('duration')) s[field] = parseTime(value);
    else s[field] = parseInt(value);
    updateUI();
}

// Touch-friendly Drag and Drop
let touchStartY = 0;
let draggedElement = null;
let initialIdx = -1;

function handleTouchStart(e) {
    if (e.target.closest('.btn-icon') || e.target.tagName === 'INPUT') return;

    // Find the draggable segment item from the header
    draggedElement = e.currentTarget.closest('.segment-item');
    if (!draggedElement) return;

    const touch = e.touches[0];
    touchStartY = touch.clientY;
    initialIdx = parseInt(draggedElement.dataset.index);

    // Add a slight delay to distinguish from scroll
    draggedElement.style.transition = 'none';
    draggedElement.style.opacity = '0.7';
    draggedElement.style.zIndex = '1000';
}

function handleTouchMove(e) {
    if (!draggedElement) return;
    const touch = e.touches[0];
    const diff = touch.clientY - touchStartY;

    // Always prevent default scrolling when dragging is active
    if (e.cancelable) e.preventDefault();

    draggedElement.style.transform = `translateY(${diff}px)`;

    const elements = Array.from(document.querySelectorAll('.segment-item'));
    const target = elements.find(el => {
        if (el === draggedElement) return false;
        const rect = el.getBoundingClientRect();
        return touch.clientY > rect.top && touch.clientY < rect.bottom;
    });

    if (target) {
        const targetIdx = parseInt(target.dataset.index);
        if (targetIdx !== initialIdx) {
            const item = segments.splice(initialIdx, 1)[0];
            segments.splice(targetIdx, 0, item);
            initialIdx = targetIdx;
            renderSegmentsList();
            // Re-bind dragged element
            draggedElement = document.querySelector(`[data-id="${item.id}"]`);
            if (draggedElement) {
                draggedElement.style.opacity = '0.7';
                draggedElement.style.zIndex = '1000';
                // We also need to re-find the header to attach the 'active' touch listener if needed?
                // Actually, the original touch session continues on the original element (header) 
                // but visually we swapped DOM. 
                // The browser tracks the touch target. The target is the header of the OLD element (now moved).
            }
            touchStartY = touch.clientY; // Reset reference
        }
    }
}

function handleTouchEnd(e) {
    if (!draggedElement) return;
    draggedElement.style.opacity = '1';
    draggedElement.style.transform = '';
    draggedElement.style.zIndex = '';
    draggedElement = null;
    updateUI();
}

function renderSegmentsList() {
    const list = document.getElementById('segmentsList');
    list.innerHTML = '';
    segments.forEach((s, index) => {
        const div = document.createElement('div');
        div.className = 'segment-item';
        div.dataset.id = s.id;
        div.dataset.index = index;
        div.style.borderLeftColor = getZone(s.power || s.power_high || 0.5).color;

        // Helper for horizontal input group
        const mkInput = (label, val, field, type = 'number', unit = '') => `
            <div class="seg-input-group">
                <label>${label}</label>
                <input type="${type}" value="${val}" onchange="updateSegment(${s.id}, '${field}', this.value)">
                ${unit ? `<span class="unit-label">${unit}</span>` : ''}
            </div>`;

        let inputs = '';
        if (s.type === 'SteadyState') {
            inputs += mkInput('Dur', formatTime(s.duration), 'duration', 'text');
            inputs += mkInput('PWR', Math.round(s.power * 100), 'power', 'number', '%');
        } else if (['Warmup', 'CoolDown', 'Ramp'].includes(s.type)) {
            inputs += mkInput('Dur', formatTime(s.duration), 'duration', 'text');
            inputs += mkInput('Start', Math.round(s.power_low * 100), 'power_low', 'number', '%');
            inputs += mkInput('End', Math.round(s.power_high * 100), 'power_high', 'number', '%');
        } else if (s.type === 'IntervalsT') {
            inputs += mkInput('Reps', s.repeat, 'repeat');
            inputs += mkInput('On', formatTime(s.on_duration), 'on_duration', 'text');
            inputs += mkInput('Pwr', Math.round(s.on_power * 100), 'on_power', 'number', '%');
            inputs += mkInput('Off', formatTime(s.off_duration), 'off_duration', 'text');
            inputs += mkInput('Pwr', Math.round(s.off_power * 100), 'off_power', 'number', '%');
        }

        div.innerHTML = `
            <div class="segment-header">
                <span class="segment-type" style="display:flex; align-items:center;"><span style="margin-right:8px; color:#666; font-size:1.2rem;">☰</span>${s.type}</span>
                <div class="segment-actions">
                    <button class="btn-icon" onclick="moveSegment(${s.id}, -1)">▲</button>
                    <button class="btn-icon" onclick="moveSegment(${s.id}, 1)">▼</button>
                    <button class="btn-icon" onclick="removeSegment(${s.id})">✕</button>
                </div>
            </div>
            <div class="segment-details">${inputs}</div>
        `;
        list.appendChild(div);

        // Attach touch listeners to the HEADER only
        const header = div.querySelector('.segment-header');
        header.addEventListener('touchstart', handleTouchStart, { passive: false });
        header.addEventListener('touchmove', handleTouchMove, { passive: false });
        header.addEventListener('touchend', handleTouchEnd);
    });
}

// ZWO Generation (Simplified for Mobile)
function saveWorkout() {
    const name = "Mobile Workout";
    let xml = `<?xml version="1.0" encoding="UTF-8"?><workout_file><author>Zwifter</author><name>${name}</name><description></description><sportType>bike</sportType><workout>`;
    segments.forEach(s => {
        if (s.type === 'SteadyState') xml += `<SteadyState Duration="${s.duration}" Power="${s.power}"/>`;
        else if (['Warmup', 'CoolDown', 'Ramp'].includes(s.type)) xml += `<${s.type} Duration="${s.duration}" PowerLow="${s.power_low}" PowerHigh="${s.power_high}"/>`;
        else if (s.type === 'IntervalsT') xml += `<IntervalsT Repeat="${s.repeat}" OnDuration="${s.on_duration}" OffDuration="${s.off_duration}" OnPower="${s.on_power}" OffPower="${s.off_power}"/>`;
    });
    xml += `</workout></workout_file>`;
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = "workout.zwo"; a.click();
}

function loadFile(e) { /* Implementation omitted for brevity, similar to desktop but simplified */ }
