const API_BASE = "http://localhost:8000";

// --- SPA View Controller ---
function switchView(viewId) {
    document.querySelectorAll('.view-screen').forEach(view => {
        view.classList.remove('active');
    });
    const targetView = document.getElementById(viewId);
    targetView.classList.add('active');

    // Fix Leaflet map rendering glitch when revealing hidden map container
    if (viewId === 'view-map') {
        setTimeout(() => {
            if (map) map.invalidateSize();
        }, 300);
    }
}

// --- ACTUAL BACKEND AUTHENTICATION ---
async function handleLogin(event) {
    event.preventDefault();
    const badge = document.getElementById('login-badge').value;
    const pass = document.getElementById('login-pass').value;
    
    const btn = event.target.querySelector('button');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> VERIFYING...';
    
    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ badge_id: badge, passcode: pass })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast(`Authentication Successful. Welcome ${data.officer_name}.`, "info");
            switchView('view-home');
        } else {
            showToast(data.detail || "Authentication Failed.", "danger");
        }
    } catch (error) {
        console.error("Login Error:", error);
        showToast("Cannot connect to Police Server Database.", "danger");
    } finally {
        btn.innerHTML = originalText;
    }
}


// --- Clock Logic ---
function updateClock() {
    const now = new Date();
    const clockEl = document.getElementById('clock');
    if(clockEl) clockEl.innerText = now.toLocaleTimeString('en-US', { hour12: false });
}
setInterval(updateClock, 1000);
updateClock();

// --- Toast Notification System ---
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let icon = '<i class="fa-solid fa-circle-info text-blue"></i>';
    if(type === 'danger') icon = '<i class="fa-solid fa-triangle-exclamation text-red" style="color:#FF3D00"></i>';
    toast.innerHTML = `<span class="toast-icon">${icon}</span><div class="toast-content">${message}</div>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 5000);
}

// ==========================================
// MAPBOX / LEAFLET INITIALIZATION (SATELLITE)
// ==========================================
const map = L.map('map').setView([20.0023, 73.7915], 18); // Centered closely on Ramkund, Nashik

// Using Google Maps Hybrid (Satellite + Streets) for maximum accuracy and street-level detail
L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    attribution: 'Map data &copy; <a href="https://www.google.com/maps">Google</a>',
    maxZoom: 22,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
}).addTo(map);

function create3DMarker(type, isDanger = false) {
    let pinClass = type === 'safe_zone' ? 'iso-pin safe' : 'iso-pin';
    if (isDanger) pinClass += ' danger';
    let radarClass = type === 'safe_zone' ? 'radar-ring safe-ring' : 'radar-ring';
    return L.divIcon({ className: 'iso-marker', html: `<div class="${radarClass}"></div><div class="${pinClass}"></div>`, iconSize: [40, 40], iconAnchor: [20, 40] });
}

let currentRouteLayer = null;
let liveLocationMarker = null;
let mapDataLayer = null;

async function loadMapData() {
    try {
        const response = await fetch(`${API_BASE}/map`);
        if(!response.ok) throw new Error("Failed to load map data");
        const geoData = await response.json();
        
        if(mapDataLayer) map.removeLayer(mapDataLayer);
        
        mapDataLayer = L.geoJSON(geoData, {
            pointToLayer: function (feature, latlng) {
                const isDanger = feature.properties.ai_risk === "HIGH";
                const marker = L.marker(latlng, { icon: create3DMarker(feature.properties.type, isDanger) });
                marker.bindPopup(`<b>${feature.properties.name}</b><br>Risk: ${feature.properties.ai_risk}`);
                return marker;
            }
        }).addTo(map);

        if(!liveLocationMarker) {
            liveLocationMarker = L.marker([20.0021, 73.7912], { 
                icon: L.divIcon({ className: 'iso-marker', html: `<div class="radar-ring" style="background: rgba(255,215,0,0.5);"></div><div class="iso-pin" style="background: var(--clr-gold);"></div>`, iconSize: [30, 30], iconAnchor: [15, 30] }) 
            }).addTo(map).bindPopup("<b>Your Live Location (Ramkund Approach)</b>");
        }

    } catch (error) { console.error("Map Load Error:", error); }
}
loadMapData();


// ==========================================
// REAL BACKEND API INTEGRATIONS
// ==========================================

// --- /sensor-data & /live-risk ---
async function fetchLiveRisk() {
    try {
        // Step 1: Poll actual centralized sensor data from Python Backend
        const sensorRes = await fetch(`${API_BASE}/sensor-data`);
        const sensors = await sensorRes.json();
        
        document.getElementById('val-density').innerText = sensors.density;
        document.getElementById('val-movement').innerText = sensors.movement;
        document.getElementById('val-change').innerText = sensors.change;

        // Step 2: Push that data to the Live Risk Model
        const response = await fetch(`${API_BASE}/live-risk?density=${sensors.density}&movement=${sensors.movement}&change=${sensors.change}`);
        const data = await response.json();
        
        const ring = document.getElementById('risk-ring');
        const valText = document.getElementById('risk-value');
        
        valText.innerText = data.status;
        ring.style.borderColor = "var(--risk-safe)"; ring.style.boxShadow = "0 0 20px rgba(0, 230, 118, 0.2)"; valText.style.color = "var(--risk-safe)";
        
        if (data.status === "WARNING") {
            ring.style.borderColor = "var(--risk-warn)"; ring.style.boxShadow = "0 0 20px rgba(255, 193, 7, 0.3)"; valText.style.color = "var(--risk-warn)";
        } else if (data.status === "DANGER") {
            ring.style.borderColor = "var(--risk-danger)"; ring.style.boxShadow = "0 0 30px rgba(255, 61, 0, 0.5)"; valText.style.color = "var(--risk-danger)";
        }
    } catch (error) { console.error("Telemetry Error:", error); }
}

// --- /predict-risk (Manual Input) ---
async function predictRiskManual() {
    const density = parseFloat(document.getElementById('sim-density').value) || 0.8;
    const movement = parseFloat(document.getElementById('sim-movement').value) || 0.7;
    const change = parseFloat(document.getElementById('sim-change').value) || 0.6;

    try {
        const response = await fetch(`${API_BASE}/predict-risk?density=${density}&movement=${movement}&change=${change}`, { method: 'POST' });
        const data = await response.json();
        const resDiv = document.getElementById('predict-result');
        resDiv.innerText = `AI Prediction: ${data.risk_level}`;
        
        if(data.risk_level === "HIGH") resDiv.style.color = "var(--risk-danger)";
        else if(data.risk_level === "MEDIUM") resDiv.style.color = "var(--risk-warn)";
        else resDiv.style.color = "var(--risk-safe)";
    } catch (error) { console.error(error); }
}

// --- /escalation-sos ---
async function runEscalationCheck() {
    const data = {
        location: "Godavari Ghat",
        density: parseFloat(document.getElementById('val-density').innerText) || 0.8,
        movement: parseFloat(document.getElementById('val-movement').innerText) || 0.7,
        change: parseFloat(document.getElementById('val-change').innerText) || 0.5
    };

    try {
        const response = await fetch(`${API_BASE}/escalation-sos`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
        });
        const result = await response.json();
        
        const box = document.getElementById('escalation-result');
        let priorityColor = result.priority === "CRITICAL" ? "#FF3D00" : (result.priority === "HIGH" ? "#FFC107" : "#00E676");
        
        box.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 8px; font-size: 0.9rem;">
                <div><strong style="color: var(--clr-godavari-blue)">Target:</strong> ${result.location}</div>
                <div><strong style="color: var(--clr-godavari-blue)">Action:</strong> <span style="color: ${priorityColor};">${result.action}</span></div>
                <div><strong style="color: var(--clr-godavari-blue)">Priority:</strong> <span style="background: ${priorityColor}; color: #000; padding: 2px 5px; border-radius: 4px;">${result.priority}</span></div>
            </div>
        `;
        if(result.priority === "CRITICAL") {
            showToast("CRITICAL ESCALATION: " + result.action, "danger");
        }
    } catch (error) { console.error(error); }
}

// --- /sos (Direct Panic Button) ---
async function triggerSOS() {
    const density = parseFloat(document.getElementById('val-density')?.innerText) || 1.0;
    try {
        // Tells the backend to enter global SOS state
        const response = await fetch(`${API_BASE}/sos?location=LiveLocation&density=${density}&movement=1.0&change=1.0`, { method: 'POST' });
        const data = await response.json();
        
        showToast(`SOS BROADCASTED TO ALL UNITS!`, "danger");
        
        // Massive UI Flash handled by the Poller below now so everyone gets it
        
        if(liveLocationMarker && typeof map !== 'undefined') {
            const ll = liveLocationMarker.getLatLng();
            L.circle(ll, { color: 'red', fillColor: '#f03', fillOpacity: 0.5, radius: 100 }).addTo(map);
            switchView('view-map');
            setTimeout(() => map.flyTo(ll, 18, { animate: true, duration: 1.5 }), 500);
        }
    } catch (error) { console.error(error); }
}

// --- /reset-sos ---
async function resetSystemSOS() {
    try {
        await fetch(`${API_BASE}/reset-sos`, { method: 'POST' });
        showToast("System Reset to Normal", "info");
        document.getElementById('sos-fullscreen-alert').classList.add('hidden');
        loadMapData(); // reload map to clear red pins
    } catch (error) { console.error(error); }
}

// --- /women-safety ---
async function checkWomenSafety() {
    const isNight = document.getElementById('is-night-toggle').checked ? 1 : 0;
    const density = parseFloat(document.getElementById('val-density')?.innerText) || 0.8;
    const movement = parseFloat(document.getElementById('val-movement')?.innerText) || 0.7;
    const change = parseFloat(document.getElementById('val-change')?.innerText) || 0.5;

    try {
        const response = await fetch(`${API_BASE}/women-safety?density=${density}&movement=${movement}&change=${change}&is_night=${isNight}`, { method: 'POST' });
        const data = await response.json();
        
        const banner = document.getElementById('safety-status-banner');
        if (data.safety_status.includes("HIGH ALERT") || data.safety_status.includes("DANGER")) {
            banner.className = "status-banner mt-1 danger";
            banner.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${data.safety_status}`;
            showToast("Women Safety HIGH ALERT triggered!", "danger");
        } else {
            banner.className = "status-banner mt-1 safe";
            banner.innerHTML = `<i class="fa-solid fa-shield-check"></i> Zone Secure`;
        }
    } catch (error) { console.error(error); }
}

// --- /safe-route ---
async function findSafeRoute() {
    const loc = document.getElementById('route-location').value || "Ramkund";
    const density = parseFloat(document.getElementById('val-density')?.innerText) || 0.8;
    const movement = parseFloat(document.getElementById('val-movement')?.innerText) || 0.7;
    const change = parseFloat(document.getElementById('val-change')?.innerText) || 0.5;

    const btn = document.querySelector('.map-sidebar .btn-accent');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Calc...';

    try {
        const response = await fetch(`${API_BASE}/safe-route?current_location=${loc}&density=${density}&movement=${movement}&change=${change}`);
        const data = await response.json();
        
        const resultDiv = document.getElementById('route-result');
        resultDiv.innerHTML = `<i class="fa-solid fa-route"></i> Route: ${data.safe_route.join(" ➔ ")}`;

        // Move the live location marker to the selected location's start coordinates
        if (liveLocationMarker && data.start_coords) {
            liveLocationMarker.setLatLng(data.start_coords);
            liveLocationMarker.bindPopup(`<b>Current Location</b><br>${data.current_location}`).openPopup();
        }

        // Draw line on map using explicit waypoints from backend
        if(currentRouteLayer) map.removeLayer(currentRouteLayer);

        if (data.waypoints && data.waypoints.length > 0) {
            currentRouteLayer = L.polyline(data.waypoints, {
                color: '#00E676', // Safe green route
                weight: 6,
                dashArray: '15, 10',
                opacity: 0.9
            }).addTo(map);

            map.fitBounds(currentRouteLayer.getBounds(), { padding: [50, 50] });
        }

    } catch (error) {
        console.error(error);
        document.getElementById('route-result').innerText = "Error calculating route.";
    } finally {
        if(btn) btn.innerHTML = originalText;
    }
}

// --- Global Polling System (Checks for SOS and Health) ---
let isSosFlashing = false;
setInterval(async () => {
    try {
        const res = await fetch(`${API_BASE}/system-status`);
        if(res.ok) {
            const statusData = await res.json();
            
            document.querySelectorAll('#health-status-text').forEach(e => e.innerText = "System Active");
            document.querySelectorAll('.health-indicator').forEach(e => e.style.backgroundColor = "var(--risk-safe)");
            
            // Check if Global SOS was triggered by ANY user
            if (statusData.sos_active && !isSosFlashing) {
                isSosFlashing = true;
                const sosAlert = document.getElementById('sos-fullscreen-alert');
                sosAlert.classList.remove('hidden');
                loadMapData(); // re-fetches map to turn all pins to High Risk
            } else if (!statusData.sos_active && isSosFlashing) {
                isSosFlashing = false;
                document.getElementById('sos-fullscreen-alert').classList.add('hidden');
                loadMapData();
            }

        }
    } catch (e) {
        document.querySelectorAll('#health-status-text').forEach(e => e.innerText = "System Offline");
        document.querySelectorAll('.health-indicator').forEach(e => e.style.backgroundColor = "var(--risk-danger)");
    }
}, 2000);
