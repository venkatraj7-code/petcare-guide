import os
import json
import math
import urllib.request
import urllib.parse
from flask import Flask, render_template, request, jsonify

app = Flask(__name__, static_folder="static", template_folder="templates")

# Load datasets
DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')

def load_json_file(filename):
    filepath = os.path.join(DATA_DIR, filename)
    if os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

BREEDS_DATA = load_json_file('breeds.json')
NUTRITION_DATA = load_json_file('nutrition.json')
SYMPTOMS_DATA = load_json_file('symptoms.json')

# Helper: Derivation rule for age_stage
def derive_age_stage(species, breed_name, age_years, weight_kg=0):
    # Lookup breed to get size_category and senior_age_threshold
    breed_info = next((b for b in BREEDS_DATA if b['breed_name'].lower() == breed_name.lower()), None)
    size_cat = breed_info['size_category'] if breed_info else ("Small" if weight_kg < 10 else ("Large" if weight_kg > 25 else "Medium"))
    senior_thresh = breed_info.get('senior_age_threshold', 7.0 if size_cat == 'Large' else (10.0 if size_cat == 'Small' else 9.0))
    
    if species == 'Dog':
        if size_cat == 'Small' and age_years < 1.0:
            return 'Puppy', size_cat
        elif size_cat == 'Medium' and age_years < 1.0:
            return 'Puppy', size_cat
        elif size_cat == 'Large' and age_years < 1.5:
            return 'Puppy', size_cat
        elif age_years >= senior_thresh:
            return 'Senior', size_cat
        else:
            return 'Adult', size_cat
    elif species == 'Cat':
        if age_years < 1.0:
            return 'Kitten', size_cat
        elif age_years >= 11.0:
            return 'Senior', size_cat
        else:
            return 'Adult', size_cat
    return 'Adult', size_cat

# Helper: Age-based Feeding Frequency (Section 2.1)
def get_feeding_frequency(age_months, age_stage):
    if age_months < 3:
        return {
            "meals_per_day": "4-6",
            "portion": "Small, little-and-often",
            "note": "Young pets have fast metabolism; free access to water; never let go >4-5h without food during the day."
        }
    elif age_months < 6:
        return {
            "meals_per_day": "3-4",
            "portion": "Small-moderate portions",
            "note": "Space meals out evenly throughout the day as growth accelerates."
        }
    elif age_months < 12:
        return {
            "meals_per_day": "2-3",
            "portion": "Moderate portions",
            "note": "Transitioning gradually toward adult meal frequency."
        }
    elif age_stage == 'Senior':
        return {
            "meals_per_day": "2",
            "portion": "Moderate, vet-adjusted portion",
            "note": "Smaller, digestible meals for aging digestive systems."
        }
    else:
        return {
            "meals_per_day": "1-2",
            "portion": "Full daily portion split across meals",
            "note": "Maintain consistent meal times to prevent bloating."
        }

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/breeds', methods=['GET'])
def get_breeds():
    species_filter = request.args.get('species')
    query = request.args.get('q', '').lower()
    
    results = BREEDS_DATA
    if species_filter:
        results = [b for b in results if b['species'].lower() == species_filter.lower()]
    if query:
        results = [b for b in results if query in b['breed_name'].lower()]
        
    return jsonify(results)

@app.route('/api/symptoms', methods=['GET'])
def get_symptoms():
    species_filter = request.args.get('species')
    results = SYMPTOMS_DATA
    if species_filter:
        results = [s for s in results if species_filter in s['species']]
    return jsonify(results)

@app.route('/api/care-guide', methods=['POST'])
def generate_care_guide():
    data = request.json or {}
    
    species = data.get('species', 'Dog')
    breed_name = data.get('breed', 'Mixed Breed Dog' if species == 'Dog' else 'Mixed Breed Cat')
    age_years = float(data.get('age_years', 2.0))
    weight_kg = float(data.get('weight_kg', 10.0))
    sex = data.get('sex', 'Male')
    neutered_spayed = bool(data.get('neutered_spayed', True))
    activity_level = data.get('activity_level', 'Medium')
    known_allergies = data.get('known_allergies', [])
    existing_conditions = data.get('existing_conditions', [])
    
    # 1. Derive age stage and size
    age_stage, size_cat = derive_age_stage(species, breed_name, age_years, weight_kg)
    age_months = age_years * 12.0
    
    # 2. Lookup breed data
    breed_data = next((b for b in BREEDS_DATA if b['breed_name'].lower() == breed_name.lower()), {
        "breed_name": breed_name,
        "species": species,
        "size_category": size_cat,
        "avg_adult_weight_kg": weight_kg,
        "energy_level": activity_level,
        "coat_type": "Medium",
        "senior_age_threshold": 7.0 if species == 'Dog' else 11.0,
        "common_health_risks": ["General Wellness Check", "Dental Hygiene"]
    })
    
    # 3. Lookup nutrition data
    species_nutrition = NUTRITION_DATA.get(species, {})
    stage_key = 'Puppy' if age_stage == 'Puppy' else ('Kitten' if age_stage == 'Kitten' else ('Senior' if age_stage == 'Senior' else 'Adult'))
    nutrition_info = species_nutrition.get(stage_key, {
        "daily_calories_per_kg": 60,
        "meals_per_day": 2,
        "recommended_food_type": "Complete & Balanced Diet",
        "foods_to_avoid": ["Chocolate", "Onions", "Xylitol"]
    })
    
    # 4. Calculate calories
    base_calories = nutrition_info['daily_calories_per_kg'] * weight_kg
    # Calorie multiplier adjustments
    multiplier = 1.0
    if neutered_spayed:
        multiplier *= 0.9
    if activity_level == 'High':
        multiplier *= 1.2
    elif activity_level == 'Low':
        multiplier *= 0.85
    daily_calories = round(base_calories * multiplier)
    
    # 5. Feeding frequency (Section 2.1 override for pets < 12 months)
    feeding_freq = get_feeding_frequency(age_months, age_stage)
    meals_count = feeding_freq['meals_per_day'] if age_months < 12 else str(nutrition_info['meals_per_day'])
    
    # 6. Foods to avoid (merge nutrition defaults + allergies)
    avoid_list = list(set(nutrition_info.get('foods_to_avoid', []) + known_allergies))
    
    # 7. Exercise plan logic
    energy = breed_data.get('energy_level', activity_level)
    if energy == 'High' and age_stage in ['Adult']:
        exercise_desc = "45–60 minutes of active play, jogging, or outdoor walks daily, split into 2 sessions."
    elif energy == 'High' and age_stage in ['Puppy', 'Kitten']:
        exercise_desc = "30–45 minutes of short, energetic play sessions with plenty of nap breaks."
    elif energy == 'Low' or age_stage == 'Senior':
        exercise_desc = "20–30 minutes of gentle walks and light indoor mental stimulation (puzzle toys)."
    else:
        exercise_desc = "30–45 minutes of moderate walks, fetch, or interactive play daily."
        
    # 8. Grooming plan logic
    coat = breed_data.get('coat_type', 'Medium')
    if coat == 'Double coat':
        grooming_desc = "Brush 2-3 times per week with a slicker brush & undercoat rake. Increase to daily during spring/fall shedding."
    elif coat == 'Curly':
        grooming_desc = "Professional grooming every 6-8 weeks; daily brushing to prevent painful hair matting."
    elif coat == 'Long':
        grooming_desc = "Daily soft brushing to prevent tangles; routine hygiene trims around paws and sanitary areas."
    elif coat == 'Short':
        grooming_desc = "Brush once weekly with a rubber curry brush; bath every 4-6 weeks or as needed."
    else:
        grooming_desc = "Regular weekly brushing, ear checks, and monthly nail trims."

    # 9. Vaccination & checkup schedule
    if species == 'Dog':
        if age_stage == 'Puppy':
            vaccine_schedule = [
                {"name": "DHPP (Distemper, Hepatitis, Parvo, Parainfluenza)", "timeline": "6-8 weeks, 10-12 weeks, 14-16 weeks"},
                {"name": "Rabies", "timeline": "12-16 weeks (Core)"},
                {"name": "Bordetella (Kennel Cough)", "timeline": "10-12 weeks (Optional/Lifestyle)"}
            ]
            next_checkup = "Every 3-4 weeks until 16 weeks old"
        elif age_stage == 'Senior':
            vaccine_schedule = [
                {"name": "DHPP Booster", "timeline": "Every 1-3 years (Vet recommended)"},
                {"name": "Rabies Booster", "timeline": "Every 1-3 years (State legally mandated)"}
            ]
            next_checkup = "Every 6 months (Includes senior blood work & joint mobility check)"
        else:
            vaccine_schedule = [
                {"name": "DHPP Core Booster", "timeline": "Every 1 to 3 years"},
                {"name": "Rabies Core Booster", "timeline": "Every 1 to 3 years"}
            ]
            next_checkup = "Annually for comprehensive physical exam & dental review"
    else: # Cat
        if age_stage == 'Kitten':
            vaccine_schedule = [
                {"name": "FVRCP (Rhinotracheitis, Calicivirus, Panleukopenia)", "timeline": "6-8 weeks, 10-12 weeks, 14-16 weeks"},
                {"name": "Rabies", "timeline": "12-16 weeks (Core)"},
                {"name": "Feline Leukemia (FeLV)", "timeline": "8-12 weeks (Kitten core)"}
            ]
            next_checkup = "Every 3-4 weeks until 16 weeks old"
        elif age_stage == 'Senior':
            vaccine_schedule = [
                {"name": "FVRCP Booster", "timeline": "Every 1-3 years"},
                {"name": "Rabies Booster", "timeline": "Every 1-3 years"}
            ]
            next_checkup = "Every 6 months (Includes kidney function screening & thyroid check)"
        else:
            vaccine_schedule = [
                {"name": "FVRCP Core Booster", "timeline": "Every 1 to 3 years"},
                {"name": "Rabies Core Booster", "timeline": "Every 1 to 3 years"}
            ]
            next_checkup = "Annually for wellness exam & dental health check"

    # Assemble response
    guide = {
        "pet_name": data.get('name', 'Your Pet'),
        "species": species,
        "breed": breed_name,
        "age_years": age_years,
        "age_months": age_months,
        "age_stage": age_stage,
        "weight_kg": weight_kg,
        "feeding": {
            "daily_calories": daily_calories,
            "meals_per_day": meals_count,
            "portion_note": feeding_freq['portion'],
            "recommended_food_type": nutrition_info.get('recommended_food_type', 'Balanced Commercial Diet'),
            "foods_to_avoid": avoid_list,
            "feeding_frequency_details": feeding_freq
        },
        "exercise": {
            "energy_level": energy,
            "recommendation": exercise_desc
        },
        "grooming": {
            "coat_type": coat,
            "recommendation": grooming_desc
        },
        "health": {
            "watch_for": breed_data.get('common_health_risks', []),
            "next_vet_checkup": next_checkup,
            "vaccination_schedule": vaccine_schedule
        }
    }
    
    return jsonify(guide)

@app.route('/api/triage', methods=['POST'])
def triage_symptom():
    data = request.json or {}
    
    species = data.get('species', 'Dog')
    symptom_id = data.get('symptom_id', '')
    duration_hours = int(data.get('duration_hours', 0))
    additional_flags = data.get('additional_flags', [])
    age_stage = data.get('age_stage', 'Adult')
    existing_conditions = data.get('existing_conditions', [])
    
    symptom_data = next((s for s in SYMPTOMS_DATA if s['id'] == symptom_id), None)
    
    if not symptom_data:
        # Default safety fallback
        return jsonify({
            "severity": "MODERATE",
            "message": "Symptom not recognized. Please consult a veterinarian for advice.",
            "action": "SUGGEST_CLINICS_OPTIONAL",
            "home_care": ["Keep pet comfortable and hydrated.", "Monitor closely."]
        })

    # Rule-based calculation according to Module 3 (Section 5)
    severity = "MILD"
    
    # 1. Red flag triggers check -> EMERGENCY
    red_flag_hits = [flag for flag in additional_flags if flag in symptom_data.get('red_flag_triggers', [])]
    if red_flag_hits:
        severity = "EMERGENCY"
    # 2. Moderate duration check
    elif duration_hours > symptom_data.get('moderate_duration_threshold', 24):
        severity = "MODERATE"

    # 3. Upgrade severity 1 level for vulnerable pets (young, senior, or underlying conditions)
    def upgrade_severity(current):
        if current == "MILD":
            return "MODERATE"
        return current # EMERGENCY stays EMERGENCY

    if severity != "EMERGENCY":
        if age_stage in ['Puppy', 'Kitten', 'Senior']:
            severity = upgrade_severity(severity)
        if existing_conditions and len(existing_conditions) > 0:
            severity = upgrade_severity(severity)
            
    # Build final response without any medication/dosages
    if severity == "EMERGENCY":
        response = {
            "severity": "EMERGENCY",
            "message": "This could be serious. Please take your pet to a veterinarian immediately.",
            "action": "SHOW_NEAREST_CLINICS",
            "home_care": None,
            "escalation_message": symptom_data.get('escalation_message', 'Seek emergency vet care immediately.')
        }
    elif severity == "MODERATE":
        response = {
            "severity": "MODERATE",
            "message": "This needs a veterinarian's attention soon (within 24 hours) if it does not improve.",
            "action": "SUGGEST_CLINICS_OPTIONAL",
            "home_care": symptom_data.get('home_care_steps', []),
            "escalation_window": symptom_data.get('escalation_window', '24 hours'),
            "escalation_message": symptom_data.get('escalation_message', '')
        }
    else: # MILD
        response = {
            "severity": "MILD",
            "message": f"Monitor your pet at home. Seek vet care if it doesn't improve within {symptom_data.get('escalation_window', '24 hours')} or worsens.",
            "action": "NONE",
            "home_care": symptom_data.get('home_care_steps', []),
            "escalation_window": symptom_data.get('escalation_window', '24 hours'),
            "escalation_message": symptom_data.get('escalation_message', '')
        }

    return jsonify(response)

@app.route('/api/vets', methods=['GET'])
def find_vets():
    lat = request.args.get('lat', type=float)
    lng = request.args.get('lng', type=float)
    query = request.args.get('query', '')

    # Default fallback clinics if Overpass API is unavailable or for local testing
    fallback_clinics = [
        {
            "id": "c1",
            "name": "Paws & Claws Veterinary Hospital",
            "address": "124 Central Park South, Suite 2A",
            "phone": "+1 (555) 234-5678",
            "distance_km": 1.2,
            "open_now": True,
            "emergency_24h": True,
            "rating": 4.9,
            "lat": (lat + 0.008) if lat else 40.765,
            "lng": (lng - 0.005) if lng else -73.978,
            "maps_link": f"https://www.google.com/maps/search/?api=1&query=Paws+Claws+Veterinary+Hospital"
        },
        {
            "id": "c2",
            "name": "Companion Care Animal Clinic",
            "address": "580 Lexington Ave",
            "phone": "+1 (555) 876-5432",
            "distance_km": 2.5,
            "open_now": True,
            "emergency_24h": False,
            "rating": 4.7,
            "lat": (lat - 0.012) if lat else 40.758,
            "lng": (lng + 0.011) if lng else -73.969,
            "maps_link": f"https://www.google.com/maps/search/?api=1&query=Companion+Care+Animal+Clinic"
        },
        {
            "id": "c3",
            "name": "Metro Emergency Pet Medical Center",
            "address": "902 Broadway Ave",
            "phone": "+1 (555) 999-1122",
            "distance_km": 3.8,
            "open_now": True,
            "emergency_24h": True,
            "rating": 4.8,
            "lat": (lat + 0.018) if lat else 40.741,
            "lng": (lng - 0.014) if lng else -73.989,
            "maps_link": f"https://www.google.com/maps/search/?api=1&query=Metro+Emergency+Pet+Medical+Center"
        },
        {
            "id": "c4",
            "name": "Furry Friends Wellness & Specialty Vet",
            "address": "310 West 42nd St",
            "phone": "+1 (555) 444-3322",
            "distance_km": 4.2,
            "open_now": False,
            "emergency_24h": False,
            "rating": 4.6,
            "lat": (lat - 0.015) if lat else 40.757,
            "lng": (lng - 0.022) if lng else -73.991,
            "maps_link": f"https://www.google.com/maps/search/?api=1&query=Furry+Friends+Wellness+Vet"
        }
    ]

    # Attempt Overpass API live fetch if lat/lng available using built-in urllib
    if lat and lng:
        try:
            overpass_url = "https://overpass-api.de/api/interpreter"
            overpass_query = f"""
            [out:json][timeout:5];
            (
              node["amenity"="veterinary"](around:10000,{lat},{lng});
              way["amenity"="veterinary"](around:10000,{lat},{lng});
            );
            out center 5;
            """
            post_data = f"data={urllib.parse.quote(overpass_query)}".encode('utf-8')
            req = urllib.request.Request(overpass_url, data=post_data, headers={'User-Agent': 'PawGuideApp/1.0 (Contact: support@pawguide.local)'})
            with urllib.request.urlopen(req, timeout=4) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode('utf-8'))
                    elements = data.get('elements', [])
                    if elements:
                        live_clinics = []
                        for idx, elem in enumerate(elements[:5]):
                            clat = elem.get('lat') or elem.get('center', {}).get('lat')
                            clng = elem.get('lon') or elem.get('center', {}).get('lon')
                            tags = elem.get('tags', {})
                            name = tags.get('name', f"Veterinary Clinic #{idx+1}")
                            addr = tags.get('addr:street', 'Local Veterinary Clinic Address')
                            phone = tags.get('phone', tags.get('contact:phone', '+1 (800) VET-CARE'))
                            
                            # Calculate rough distance
                            dlat = math.radians(clat - lat)
                            dlng = math.radians(clng - lng)
                            a = math.sin(dlat/2)**2 + math.cos(math.radians(lat)) * math.cos(math.radians(clat)) * math.sin(dlng/2)**2
                            dist_km = round(6371 * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a)), 1)
                            
                            live_clinics.append({
                                "id": f"live_{idx}",
                                "name": name,
                                "address": addr,
                                "phone": phone,
                                "distance_km": dist_km,
                                "open_now": True,
                                "emergency_24h": "emergency" in tags or "24" in tags.get('opening_hours', ''),
                                "rating": 4.8,
                                "lat": clat,
                                "lng": clng,
                                "maps_link": f"https://www.google.com/maps/search/?api=1&query={clat},{clng}"
                            })
                        return jsonify(live_clinics)
        except Exception as e:
            print("Overpass API fallback activated:", e)

    return jsonify(fallback_clinics)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)

