from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel 
import json
import os
import random
import numpy as np
from sklearn.linear_model import LogisticRegression

app = FastAPI()

# Allow CORS for the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =====================
# GLOBAL BACKEND STATE
# =====================
GLOBAL_STATE = {
    "sos_active": False,
    "emergency_type": "",
    "dispatched_units": "",
    "density": 0.4,
    "movement": 0.5,
    "change": 0.2
}

# =====================
# ROUTING GRAPH FOR NASHIK
# =====================
ROUTING_GRAPH = {
    "Ramkund": {
        "start_coords": [19.9983, 73.7892],
        "routes": {
            "HIGH": {"text": ["Ramkund", "Malviya Chowk", "CBS", "Civil Hospital (Safe Zone)"], "waypoints": [[19.9983, 73.7892], [19.9995, 73.7850], [19.9980, 73.7800], [19.9990, 73.7780]]},
            "MEDIUM": {"text": ["Ramkund", "Panchavati Sector", "Exit Gate 2"], "waypoints": [[19.9983, 73.7892], [20.0020, 73.7900], [20.0050, 73.7940]]},
            "LOW": {"text": ["Ramkund", "Normal Exit"], "waypoints": [[19.9983, 73.7892], [20.0000, 73.7880]]}
        }
    },
    "Sadhugram (Tapovan)": {
        "start_coords": [20.0031, 73.8115],
        "routes": {
            "HIGH": {"text": ["Sadhugram", "Aurangabad Road", "Nashik Road Station (Safe Zone)"], "waypoints": [[20.0031, 73.8115], [19.9950, 73.8150], [19.9800, 73.8250], [19.9500, 73.8400]]},
            "MEDIUM": {"text": ["Sadhugram", "Tapovan Link Road", "Open Ground B"], "waypoints": [[20.0031, 73.8115], [20.0000, 73.8050], [19.9950, 73.8000]]},
            "LOW": {"text": ["Sadhugram", "Main Gate"], "waypoints": [[20.0031, 73.8115], [20.0050, 73.8100]]}
        }
    },
    "Kalaram Temple": {
        "start_coords": [20.0019, 73.7936],
        "routes": {
            "HIGH": {"text": ["Kalaram Temple", "Sita Gufa Road", "Police Parade Ground (Safe Zone)"], "waypoints": [[20.0019, 73.7936], [20.0040, 73.7900], [20.0050, 73.7710]]},
            "MEDIUM": {"text": ["Kalaram Temple", "Panchavati Karanja", "Exit Gate 3"], "waypoints": [[20.0019, 73.7936], [20.0000, 73.7950], [19.9950, 73.7980]]},
            "LOW": {"text": ["Kalaram Temple", "Temple Exit"], "waypoints": [[20.0019, 73.7936], [20.0025, 73.7940]]}
        }
    },
    "Panchavati": {
        "start_coords": [20.0050, 73.7940],
        "routes": {
            "HIGH": {"text": ["Panchavati", "Makhmalabad Naka", "Police Parade Ground (Safe Zone)"], "waypoints": [[20.0050, 73.7940], [20.0100, 73.7850], [20.0050, 73.7710]]},
            "MEDIUM": {"text": ["Panchavati", "Nimani Bus Stand", "Exit"], "waypoints": [[20.0050, 73.7940], [20.0080, 73.7980], [20.0120, 73.8000]]},
            "LOW": {"text": ["Panchavati", "Normal Path"], "waypoints": [[20.0050, 73.7940], [20.0060, 73.7950]]}
        }
    },
    "Godavari Ghat": {
        "start_coords": [19.9955, 73.7810],
        "routes": {
            "HIGH": {"text": ["Godavari Ghat", "Ashok Stambh", "Civil Hospital (Safe Zone)"], "waypoints": [[19.9955, 73.7810], [19.9970, 73.7790], [19.9990, 73.7780]]},
            "MEDIUM": {"text": ["Godavari Ghat", "Victoria Bridge", "Exit"], "waypoints": [[19.9955, 73.7810], [19.9930, 73.7830], [19.9900, 73.7850]]},
            "LOW": {"text": ["Godavari Ghat", "Normal Path"], "waypoints": [[19.9955, 73.7810], [19.9940, 73.7820]]}
        }
    },
    "Kapaleshwar Temple": {
        "start_coords": [20.0000, 73.7915],
        "routes": {
            "HIGH": {"text": ["Kapaleshwar Temple", "Malviya Chowk", "Civil Hospital (Safe Zone)"], "waypoints": [[20.0000, 73.7915], [19.9995, 73.7850], [19.9990, 73.7780]]},
            "MEDIUM": {"text": ["Kapaleshwar Temple", "Ramkund Approach", "Exit"], "waypoints": [[20.0000, 73.7915], [19.9980, 73.7900], [19.9950, 73.7950]]},
            "LOW": {"text": ["Kapaleshwar Temple", "Normal Path"], "waypoints": [[20.0000, 73.7915], [20.0010, 73.7920]]}
        }
    },
    "Trimbakeshwar": {
        "start_coords": [19.9320, 73.5300],
        "routes": {
            "HIGH": {"text": ["Trimbakeshwar", "Brahmagiri Base", "Trimbak Hospital (Safe Zone)"], "waypoints": [[19.9320, 73.5300], [19.9300, 73.5250], [19.9350, 73.5200]]},
            "MEDIUM": {"text": ["Trimbakeshwar", "Kushavarta Road", "Exit Gate"], "waypoints": [[19.9320, 73.5300], [19.9340, 73.5320], [19.9360, 73.5350]]},
            "LOW": {"text": ["Trimbakeshwar", "Normal Path"], "waypoints": [[19.9320, 73.5300], [19.9310, 73.5310]]}
        }
    }
}

class LoginRequest(BaseModel):
    badge_id: str
    passcode: str

class EscalationSOS(BaseModel):
    location: str
    density: float
    movement: float
    change: float

class DispatchRequest(BaseModel):
    emergency_type: str
    location: str

# =====================
# ML MODEL (DUMMY SETUP)
# =====================
X = np.array([
    [0.2, 0.3, 0.1],
    [0.8, 0.7, 0.6],
    [0.5, 0.4, 0.3],
    [0.9, 0.8, 0.7],
    [0.3, 0.2, 0.2]
])
y = np.array([0, 2, 1, 2, 0])
model = LogisticRegression()
model.fit(X, y)

# =====================
# ENDPOINTS
# =====================

@app.get("/")
def home():
    return {"message": "Anjaneya AI Running 🚀"}

@app.post("/login")
def login(creds: LoginRequest):
    # Hardcoded authentication check
    if creds.badge_id == "NKO-4921" and creds.passcode == "admin123":
        return {"success": True, "officer_name": "Cmdr. Sharma"}
    raise HTTPException(status_code=401, detail="Invalid Badge ID or Passcode")

@app.get("/system-status")
def system_status():
    return {
        "status": "running",
        "sos_active": GLOBAL_STATE["sos_active"],
        "emergency_type": GLOBAL_STATE["emergency_type"],
        "dispatched_units": GLOBAL_STATE["dispatched_units"]
    }

@app.get("/sensor-data")
def get_sensor_data():
    # Simulate fluctuating crowd sensors managed centrally by the backend
    if GLOBAL_STATE["sos_active"]:
        GLOBAL_STATE["density"] = min(1.0, GLOBAL_STATE["density"] + random.uniform(0.0, 0.1))
        GLOBAL_STATE["movement"] = max(0.1, GLOBAL_STATE["movement"] - random.uniform(0.0, 0.1))
    else:
        GLOBAL_STATE["density"] = max(0.1, min(1.0, GLOBAL_STATE["density"] + random.uniform(-0.05, 0.05)))
        GLOBAL_STATE["movement"] = max(0.1, min(1.0, GLOBAL_STATE["movement"] + random.uniform(-0.05, 0.05)))
    
    GLOBAL_STATE["change"] = random.uniform(0.1, 0.3)
    
    return {
        "density": round(GLOBAL_STATE["density"], 2),
        "movement": round(GLOBAL_STATE["movement"], 2),
        "change": round(GLOBAL_STATE["change"], 2)
    }

@app.post("/predict-risk")
def predict_risk(density: float, movement: float, change: float):
    input_data = np.array([[density, movement, change]])
    prediction = model.predict(input_data)[0]
    labels = {0: "LOW", 1: "MEDIUM", 2: "HIGH"}
    return {"risk_level": labels[prediction]}

@app.post("/escalation-sos")
def escalation_sos(data: EscalationSOS):
    input_data = np.array([[data.density, data.movement, data.change]])
    prediction = model.predict(input_data)[0]
    labels = {0: "LOW", 1: "MEDIUM", 2: "HIGH"}
    risk = labels[prediction]

    if risk == "HIGH":
        action = "POLICE_CONTROL_ROOM_ALERT 🚨"
        priority = "CRITICAL"
    elif risk == "MEDIUM":
        action = "LOCAL_SECURITY_ALERT ⚠️"
        priority = "HIGH"
    else:
        action = "MONITORING"
        priority = "LOW"

    return {"location": data.location, "risk_level": risk, "action": action, "priority": priority}

@app.post("/sos")
def sos(location: str, density: float, movement: float, change: float):
    # Set the global backend state so all polling clients know it's an emergency
    GLOBAL_STATE["sos_active"] = True
    
    input_data = np.array([[density, movement, change]])
    prediction = model.predict(input_data)[0]
    labels = {0: "LOW", 1: "MEDIUM", 2: "HIGH"}
    risk = labels[prediction]

    priority = "LOW"
    if risk == "HIGH": priority = "URGENT 🚨"
    elif risk == "MEDIUM": priority = "MODERATE"

    return {"location": location, "risk_level": risk, "priority": priority}

@app.post("/verify-dispatch")
def verify_dispatch(req: DispatchRequest):
    is_fake = False
    
    if req.emergency_type == "Stampede":
        if GLOBAL_STATE["density"] < 0.5:
            is_fake = True
    else:
        confidence = random.uniform(0.0, 1.0)
        if confidence < 0.3:
            is_fake = True

    if is_fake:
        return {"is_fake": True, "message": "AI VERIFICATION FAILED: Telemetry does not match report. Alert Logged as Potential Prank."}

    GLOBAL_STATE["sos_active"] = True
    GLOBAL_STATE["emergency_type"] = req.emergency_type

    units = "Local Armed Police"
    if req.emergency_type == "Bomb Threat": units = "Bomb Disposal Squad (BDS) & ATS"
    elif req.emergency_type == "Violent Crime": units = "SRPF & Local Armed Police"
    elif req.emergency_type == "Women Safety": units = "Nirbhaya Squad"
    elif req.emergency_type == "Stampede": units = "Rapid Action Force (RAF)"
    
    GLOBAL_STATE["dispatched_units"] = units
    return {"is_fake": False, "emergency_type": req.emergency_type, "dispatched_units": units}

@app.post("/reset-sos")
def reset_sos():
    GLOBAL_STATE["sos_active"] = False
    GLOBAL_STATE["emergency_type"] = ""
    GLOBAL_STATE["dispatched_units"] = ""
    GLOBAL_STATE["density"] = 0.3
    return {"status": "System Reset to Normal"}

@app.post("/women-safety")
def women_safety(density: float, movement: float, change: float, is_night: int):
    input_data = np.array([[density, movement, change]])
    prediction = model.predict(input_data)[0]
    labels = {0: "SAFE", 1: "CAUTION", 2: "DANGER"}
    status = labels[prediction]

    if is_night == 1 and status != "SAFE":
        status = "HIGH ALERT 🚨"
    return {"safety_status": status}

@app.get("/safe-route")
def safe_route(current_location: str, density: float, movement: float, change: float):
    input_data = np.array([[density, movement, change]])
    prediction = model.predict(input_data)[0]
    labels = {0: "LOW", 1: "MEDIUM", 2: "HIGH"}
    risk = labels[prediction]

    loc_data = ROUTING_GRAPH.get(current_location, ROUTING_GRAPH["Ramkund"])
    route_info = loc_data["routes"][risk]

    return {
        "current_location": current_location, 
        "start_coords": loc_data["start_coords"],
        "risk_level": risk, 
        "safe_route": route_info["text"],
        "waypoints": route_info["waypoints"]
    }

@app.get("/live-risk")
def live_risk(density: float, movement: float, change: float):
    score = (density * 0.5) + (movement * 0.3) + (change * 0.2)
    if score > 0.7: status = "DANGER"
    elif score > 0.4: status = "WARNING"
    else: status = "SAFE"
    return {"risk_score": round(score, 2), "status": status}

@app.get("/map")
def get_map():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(base_dir, "data", "kumbh_map.geojson")
    
    try:
        with open(file_path, "r") as f: data = json.load(f)
        for feature in data["features"]:
            if feature["properties"].get("type") == "crowd_zone":
                # If global SOS is active, mark all crowd zones as High Risk
                feature["properties"]["ai_risk"] = "HIGH" if GLOBAL_STATE["sos_active"] else "MEDIUM"
            else:
                feature["properties"]["ai_risk"] = "SAFE"
        return data
    except Exception as e:
        print(f"Error loading map: {e}")
        return {"error": str(e), "path_tried": file_path}

@app.get("/broadcast")
def broadcast(level: str):
    if level == "HIGH": return {"alert": "EVACUATE IMMEDIATELY 🚨"}
    return {"alert": "Stay alert"}

@app.get("/health")
def health():
    return {"status": "running", "system": "Anjaneya AI", "version": "1.0"}