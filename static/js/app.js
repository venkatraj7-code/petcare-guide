/* ==========================================================================
   PawGuide — Main Frontend Application JavaScript
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

    // Global State
    let pets = JSON.parse(localStorage.getItem('pawguide_pets')) || [];
    let activePetId = localStorage.getItem('pawguide_active_pet_id') || null;
    let activeCareGuide = null;
    let symptomsData = [];
    let selectedSymptom = null;
    let reminders = JSON.parse(localStorage.getItem('pawguide_reminders')) || [];
    let vetClinics = [];
    let mapInstance = null;
    let userLocation = { lat: 40.758, lng: -73.985 }; // Default NYC coords fallback

    // Initialize Application
    initApp();

    function initApp() {
        setupNavigation();
        setupModals();
        setupOnboarding();
        setupTriage();
        setupVetFinder();
        setupReminders();

        if (pets.length === 0) {
            // Show Onboarding Modal for first-time user
            openModal('modal-onboarding');
        } else {
            if (!activePetId || !pets.find(p => p.id === activePetId)) {
                activePetId = pets[0].id;
            }
            renderPetSelector();
            loadActivePetGuide();
        }
    }

    /* --------------------------------------------------------------------------
       NAVIGATION & TABS
       -------------------------------------------------------------------------- */
    function setupNavigation() {
        const navTabs = document.querySelectorAll('.nav-tab');
        navTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetPane = tab.getAttribute('data-tab');
                switchTab(targetPane);
            });
        });

        // Quick Launch Buttons
        document.getElementById('btn-launch-triage').addEventListener('click', () => switchTab('triage'));
        document.getElementById('btn-quick-vet-search').addEventListener('click', () => switchTab('vet-finder'));
    }

    function switchTab(tabId) {
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

        const targetTab = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
        const targetPane = document.getElementById(`pane-${tabId}`);

        if (targetTab) targetTab.classList.add('active');
        if (targetPane) targetPane.classList.add('active');

        // Special init for Leaflet Map when switching to vet-finder
        if (tabId === 'vet-finder') {
            setTimeout(initLeafletMap, 200);
        }
    }

    /* --------------------------------------------------------------------------
       MODALS MANAGEMENT
       -------------------------------------------------------------------------- */
    function setupModals() {
        document.querySelectorAll('[data-close]').forEach(btn => {
            btn.addEventListener('click', () => {
                const modalId = btn.getAttribute('data-close');
                closeModal(modalId);
            });
        });

        // Detail buttons on Dashboard Cards
        document.querySelectorAll('.btn-card-detail').forEach(btn => {
            btn.addEventListener('click', () => {
                const modalId = btn.getAttribute('data-modal');
                populateCardDetailModal(modalId);
                openModal(modalId);
            });
        });
    }

    function openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('hidden');
    }

    function closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('hidden');
    }

    /* --------------------------------------------------------------------------
       PET SELECTOR & PROFILE MANAGEMENT
       -------------------------------------------------------------------------- */
    function renderPetSelector() {
        const activePet = pets.find(p => p.id === activePetId) || pets[0];
        if (!activePet) return;

        document.getElementById('pet-pill-name').textContent = activePet.name;
        const icon = document.getElementById('pet-pill-icon');
        icon.className = activePet.species === 'Dog' ? 'fa-solid fa-dog' : 'fa-solid fa-cat';

        const dropdownContainer = document.getElementById('pet-list-container');
        dropdownContainer.innerHTML = pets.map(p => `
            <div class="pet-option-item ${p.id === activePetId ? 'active' : ''}" data-pet-id="${p.id}">
                <i class="fa-solid ${p.species === 'Dog' ? 'fa-dog' : 'fa-cat'} text-teal"></i>
                <span>${p.name}</span>
            </div>
        `).join('');

        document.querySelectorAll('.pet-option-item').forEach(item => {
            item.addEventListener('click', () => {
                activePetId = item.getAttribute('data-pet-id');
                localStorage.setItem('pawguide_active_pet_id', activePetId);
                document.getElementById('pet-dropdown').classList.remove('show');
                renderPetSelector();
                loadActivePetGuide();
            });
        });

        const pillBtn = document.getElementById('pet-pill-btn');
        pillBtn.onclick = (e) => {
            e.stopPropagation();
            document.getElementById('pet-dropdown').classList.toggle('show');
        };

        document.addEventListener('click', () => {
            document.getElementById('pet-dropdown').classList.remove('show');
        });

        document.getElementById('btn-add-new-pet').addEventListener('click', () => {
            document.getElementById('pet-dropdown').classList.remove('show');
            openModal('modal-onboarding');
        });
    }

    /* --------------------------------------------------------------------------
       MODULE 1: ONBOARDING & FEEDING ALERT TRIGGER (Section 2.1)
       -------------------------------------------------------------------------- */
    function setupOnboarding() {
        // Species Card Toggle
        const dogCard = document.getElementById('species-dog-card');
        const catCard = document.getElementById('species-cat-card');
        const breedInput = document.getElementById('breed-input');

        dogCard.addEventListener('click', () => {
            dogCard.classList.add('active');
            catCard.classList.remove('active');
            dogCard.querySelector('input').checked = true;
            breedInput.value = 'Golden Retriever';
        });

        catCard.addEventListener('click', () => {
            catCard.classList.add('active');
            dogCard.classList.remove('active');
            catCard.querySelector('input').checked = true;
            breedInput.value = 'Domestic Shorthair (Tabby / Cat)';
        });

        // Stepper Navigation
        const steps = document.querySelectorAll('.ob-step');
        document.querySelectorAll('.btn-next-step').forEach(btn => {
            btn.addEventListener('click', () => {
                const currentStep = btn.closest('.ob-step');
                const stepNum = parseInt(currentStep.getAttribute('data-step'));
                
                if (stepNum === 2) {
                    // Check age submitted rule (Section 2.1)
                    const ageYears = parseFloat(document.getElementById('age-years').value) || 1;
                    const ageMonths = ageYears * 12.0;
                    
                    if (ageMonths < 12) {
                        triggerSection21FeedingPopup(ageMonths);
                    }
                }

                currentStep.classList.remove('active');
                document.querySelector(`.ob-step[data-step="${stepNum + 1}"]`).classList.add('active');
            });
        });

        document.querySelectorAll('.btn-prev-step').forEach(btn => {
            btn.addEventListener('click', () => {
                const currentStep = btn.closest('.ob-step');
                const stepNum = parseInt(currentStep.getAttribute('data-step'));
                currentStep.classList.remove('active');
                document.querySelector(`.ob-step[data-step="${stepNum - 1}"]`).classList.add('active');
            });
        });

        // Autocomplete breed search
        const breedResults = document.getElementById('breed-autocomplete-results');
        breedInput.addEventListener('input', async () => {
            const query = breedInput.value.trim();
            const species = document.querySelector('input[name="species"]:checked').value;
            if (query.length < 1) {
                breedResults.classList.add('hidden');
                return;
            }
            try {
                const res = await fetch(`/api/breeds?species=${species}&q=${encodeURIComponent(query)}`);
                const breeds = await res.json();
                if (breeds.length > 0) {
                    breedResults.innerHTML = breeds.map(b => `<div class="autocomplete-item">${b.breed_name}</div>`).join('');
                    breedResults.classList.remove('hidden');
                    
                    breedResults.querySelectorAll('.autocomplete-item').forEach(item => {
                        item.addEventListener('click', () => {
                            breedInput.value = item.textContent;
                            breedResults.classList.add('hidden');
                        });
                    });
                } else {
                    breedResults.classList.add('hidden');
                }
            } catch (err) {
                console.error("Breed fetch error", err);
            }
        });

        // Form Submit
        document.getElementById('onboarding-form').addEventListener('submit', async (e) => {
            e.preventDefault();

            const species = document.querySelector('input[name="species"]:checked').value;
            const name = document.getElementById('pet-name').value.trim() || 'My Pet';
            const breed = breedInput.value.trim() || (species === 'Dog' ? 'Golden Retriever' : 'Domestic Shorthair (Tabby / Cat)');
            const age_years = parseFloat(document.getElementById('age-years').value) || 2;
            const weight_kg = parseFloat(document.getElementById('weight-kg').value) || 10;
            const sex = document.getElementById('pet-sex').value;
            const neutered_spayed = document.getElementById('pet-neutered').value === 'true';
            const activity_level = document.getElementById('activity-level').value;
            
            const allergiesRaw = document.getElementById('allergies-input').value;
            const known_allergies = allergiesRaw ? allergiesRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
            
            const conditionsRaw = document.getElementById('conditions-input').value;
            const existing_conditions = conditionsRaw ? conditionsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

            const newPet = {
                id: 'pet_' + Date.now(),
                name, species, breed, age_years, weight_kg, sex, neutered_spayed, activity_level, known_allergies, existing_conditions
            };

            pets.push(newPet);
            activePetId = newPet.id;
            localStorage.setItem('pawguide_pets', JSON.stringify(pets));
            localStorage.setItem('pawguide_active_pet_id', activePetId);

            closeModal('modal-onboarding');
            renderPetSelector();
            await loadActivePetGuide();
        });
    }

    // Section 2.1 Feeding Alert Trigger Popup Logic
    function triggerSection21FeedingPopup(ageMonths) {
        const modalAlert = document.getElementById('modal-feeding-alert');
        const alertTitle = document.getElementById('feeding-alert-title');
        const alertMsg = document.getElementById('feeding-alert-message');

        let freqText = "3-4 times a day in small-moderate amounts";
        if (ageMonths < 3) freqText = "4-6 times a day in small, little-and-often amounts";
        else if (ageMonths < 6) freqText = "3-4 times a day in small-moderate amounts";
        else freqText = "2-3 times a day in moderate amounts";

        alertTitle.textContent = `Young Pet (${Math.round(ageMonths)} mos) — Feeding Schedule`;
        alertMsg.textContent = `At ${Math.round(ageMonths)} months old, your pet should be fed ${freqText} — not the same as an adult meal schedule. We'll build this directly into your care guide.`;

        openModal('modal-feeding-alert');

        document.getElementById('btn-alert-set-reminders').onclick = () => {
            createFeedingRemindersForYoungPet(ageMonths);
            closeModal('modal-feeding-alert');
            switchTab('reminders');
        };

        document.getElementById('btn-alert-continue').onclick = () => {
            closeModal('modal-feeding-alert');
        };
    }

    function createFeedingRemindersForYoungPet(ageMonths) {
        let times = ["08:00", "13:00", "18:00"];
        if (ageMonths < 3) times = ["07:00", "11:00", "15:00", "19:00"];
        else if (ageMonths < 6) times = ["08:00", "13:00", "18:00"];
        else times = ["08:00", "18:00"];

        times.forEach((t, idx) => {
            reminders.push({
                id: 'rem_' + Date.now() + '_' + idx,
                title: `Meal #${idx + 1} Portion`,
                time: t,
                category: 'Feeding',
                completed: false
            });
        });
        localStorage.setItem('pawguide_reminders', JSON.stringify(reminders));
        renderRemindersList();
    }

    /* --------------------------------------------------------------------------
       MODULE 2: CARE GUIDE GENERATOR & DASHBOARD
       -------------------------------------------------------------------------- */
    async function loadActivePetGuide() {
        const pet = pets.find(p => p.id === activePetId);
        if (!pet) return;

        try {
            const res = await fetch('/api/care-guide', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(pet)
            });
            activeCareGuide = await res.json();
            renderDashboardCards(activeCareGuide);
        } catch (err) {
            console.error("Care guide load error", err);
        }
    }

    function renderDashboardCards(guide) {
        // Hero
        document.getElementById('hero-pet-name').textContent = guide.pet_name;
        document.getElementById('hero-pet-stage').textContent = `${guide.age_stage} ${guide.species}`;
        document.getElementById('hero-pet-breed').textContent = guide.breed;
        document.getElementById('hero-pet-weight').textContent = `${guide.weight_kg} kg`;
        document.getElementById('hero-pet-age').textContent = `${guide.age_years} yrs`;
        
        const avatar = document.getElementById('hero-pet-avatar');
        avatar.innerHTML = guide.species === 'Dog' ? '<i class="fa-solid fa-dog"></i>' : '<i class="fa-solid fa-cat"></i>';

        // Card 1: Feeding
        document.getElementById('card-calories').textContent = guide.feeding.daily_calories.toLocaleString();
        document.getElementById('card-meals').textContent = guide.feeding.meals_per_day;
        document.getElementById('card-food-type').textContent = guide.feeding.recommended_food_type;
        document.getElementById('card-portion-note').textContent = guide.feeding.portion_note;

        const avoidContainer = document.getElementById('card-avoid-pills');
        avoidContainer.innerHTML = guide.feeding.foods_to_avoid.map(item => `
            <span class="pill-tag"><i class="fa-solid fa-triangle-exclamation"></i> ${item}</span>
        `).join('');

        // Card 2: Exercise
        document.getElementById('card-exercise-target').textContent = guide.age_stage.includes('Puppy') || guide.age_stage.includes('Kitten') ? '30 - 45 Mins' : '45 - 60 Mins';
        document.getElementById('card-energy-level').textContent = `${guide.exercise.energy_level} Energy`;
        document.getElementById('card-exercise-desc').textContent = guide.exercise.recommendation;

        // Card 3: Grooming
        document.getElementById('card-coat-type').textContent = guide.grooming.coat_type;
        document.getElementById('card-grooming-desc').textContent = guide.grooming.recommendation;

        // Card 4: Health Watchlist
        document.getElementById('card-next-checkup').textContent = guide.health.next_vet_checkup;
        const watchContainer = document.getElementById('card-watch-pills');
        watchContainer.innerHTML = guide.health.watch_for.map(risk => `
            <span class="badge breed-badge"><i class="fa-solid fa-shield-virus"></i> ${risk}</span>
        `).join('');
    }

    function populateCardDetailModal(modalId) {
        if (!activeCareGuide) return;

        if (modalId === 'modal-feeding-detail') {
            document.getElementById('modal-feeding-body').innerHTML = `
                <div class="info-line">
                    <strong>Daily Energy Requirement (RER/MER):</strong>
                    <p>${activeCareGuide.feeding.daily_calories} kcal per day based on ${activeCareGuide.weight_kg}kg weight.</p>
                </div>
                <div class="info-line">
                    <strong>Meal Schedule & Frequency:</strong>
                    <p>${activeCareGuide.feeding.meals_per_day} meals daily. ${activeCareGuide.feeding.feeding_frequency_details.note}</p>
                </div>
                <div class="info-line">
                    <strong>Recommended Food Type:</strong>
                    <p>${activeCareGuide.feeding.recommended_food_type}</p>
                </div>
                <div class="info-line">
                    <strong>Strictly Unsafe Toxic Foods List (ASPCA):</strong>
                    <div class="pills-flex margin-top-xs">
                        ${activeCareGuide.feeding.foods_to_avoid.map(f => `<span class="pill-tag">${f}</span>`).join('')}
                    </div>
                </div>
            `;
        } else if (modalId === 'modal-exercise-detail') {
            document.getElementById('modal-exercise-body').innerHTML = `
                <div class="info-line">
                    <strong>Breed Energy Level:</strong>
                    <p>${activeCareGuide.exercise.energy_level} Energy Profile</p>
                </div>
                <div class="info-line">
                    <strong>Exercise Guidelines:</strong>
                    <p>${activeCareGuide.exercise.recommendation}</p>
                </div>
                <div class="info-line">
                    <strong>Mental Stimulation Tips:</strong>
                    <p>Incorporate puzzle feeders, scent work, and interactive obedience training sessions daily to keep your pet mentally sharp.</p>
                </div>
            `;
        } else if (modalId === 'modal-grooming-detail') {
            document.getElementById('modal-grooming-body').innerHTML = `
                <div class="info-line">
                    <strong>Coat Type:</strong>
                    <p>${activeCareGuide.grooming.coat_type}</p>
                </div>
                <div class="info-line">
                    <strong>Coat Maintenance Plan:</strong>
                    <p>${activeCareGuide.grooming.recommendation}</p>
                </div>
                <div class="info-line">
                    <strong>Hygiene Checklist:</strong>
                    <ul>
                        <li>Ear Inspection: Weekly check for discharge or odor</li>
                        <li>Nail Trimming: Clip every 3-4 weeks</li>
                        <li>Dental Care: Daily brushing with pet-safe toothpaste</li>
                    </ul>
                </div>
            `;
        } else if (modalId === 'modal-health-detail') {
            const vaccinesHtml = activeCareGuide.health.vaccination_schedule.map(v => `
                <div style="background:var(--color-bg); padding:0.6rem; border-radius:8px; margin-bottom:0.5rem;">
                    <strong>${v.name}</strong>
                    <p style="font-size:0.85rem; color:var(--color-text-muted);">${v.timeline}</p>
                </div>
            `).join('');

            document.getElementById('modal-health-body').innerHTML = `
                <div class="info-line">
                    <strong>Routine Checkup Target:</strong>
                    <p>${activeCareGuide.health.next_vet_checkup}</p>
                </div>
                <div class="info-line">
                    <strong>Breed Predispositions Watchlist:</strong>
                    <p>Discuss these specific health risks with your vet during annual checkups: ${activeCareGuide.health.watch_for.join(', ')}.</p>
                </div>
                <div class="info-line">
                    <strong>Recommended Core Vaccine Schedule:</strong>
                    <div style="margin-top:0.5rem;">${vaccinesHtml}</div>
                </div>
            `;
        }
    }

    /* --------------------------------------------------------------------------
       MODULE 3: SYMPTOM TRIAGE & HEALTH ADVISOR
       -------------------------------------------------------------------------- */
    function setupTriage() {
        loadSymptomsData();

        // Duration Slider Sync
        const slider = document.getElementById('symptom-duration');
        const durationText = document.getElementById('duration-val-text');
        slider.addEventListener('input', () => {
            durationText.textContent = slider.value;
        });

        // Back from Step 2 to Step 1
        document.getElementById('btn-back-step-1').addEventListener('click', () => {
            showTriageStep(1);
        });

        // Submit Triage
        document.getElementById('btn-submit-triage').addEventListener('click', submitTriageEvaluation);

        // Restart Triage
        document.getElementById('btn-restart-triage').addEventListener('click', () => {
            showTriageStep(1);
        });

        // Trigger Vet Map from Emergency State
        document.getElementById('btn-trigger-vet-map').addEventListener('click', () => {
            switchTab('vet-finder');
        });

        document.getElementById('btn-view-clinics-optional').addEventListener('click', () => {
            switchTab('vet-finder');
        });
    }

    async function loadSymptomsData() {
        const pet = pets.find(p => p.id === activePetId);
        const species = pet ? pet.species : 'Dog';

        try {
            const res = await fetch(`/api/symptoms?species=${species}`);
            symptomsData = await res.json();
            renderSymptomsGrid('all');
            setupCategoryFilterPills();
        } catch (err) {
            console.error("Symptoms load error", err);
        }
    }

    function setupCategoryFilterPills() {
        const pills = document.querySelectorAll('.cat-pill');
        pills.forEach(pill => {
            pill.addEventListener('click', () => {
                pills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                const cat = pill.getAttribute('data-cat');
                renderSymptomsGrid(cat);
            });
        });
    }

    function renderSymptomsGrid(catFilter) {
        const grid = document.getElementById('symptoms-grid');
        let filtered = symptomsData;
        if (catFilter !== 'all') {
            filtered = symptomsData.filter(s => s.category === catFilter);
        }

        grid.innerHTML = filtered.map(s => `
            <div class="symptom-item-card" data-symptom-id="${s.id}">
                <h4>${s.symptom_name}</h4>
                <span class="symptom-cat-tag">${s.category}</span>
            </div>
        `).join('');

        grid.querySelectorAll('.symptom-item-card').forEach(card => {
            card.addEventListener('click', () => {
                const sId = card.getAttribute('data-symptom-id');
                selectedSymptom = symptomsData.find(s => s.id === sId);
                selectSymptomForTriage(selectedSymptom);
            });
        });
    }

    function selectSymptomForTriage(symptom) {
        document.getElementById('triage-selected-title').textContent = symptom.symptom_name;

        // Render Red Flag checkboxes
        const container = document.getElementById('red-flags-container');
        if (symptom.red_flag_options && symptom.red_flag_options.length > 0) {
            container.innerHTML = symptom.red_flag_options.map(opt => `
                <label class="red-flag-checkbox">
                    <input type="checkbox" value="${opt.id}">
                    <span>${opt.label}</span>
                </label>
            `).join('');
        } else {
            container.innerHTML = '<p style="color:var(--color-text-muted); font-size:0.9rem;">No specific red flags for this symptom. Select duration below.</p>';
        }

        showTriageStep(2);
    }

    function showTriageStep(stepNum) {
        document.querySelectorAll('.triage-step').forEach(step => step.classList.remove('active'));
        document.getElementById(`triage-step-${stepNum}`).classList.add('active');
    }

    async function submitTriageEvaluation() {
        if (!selectedSymptom) return;

        const pet = pets.find(p => p.id === activePetId) || {};
        const durationHours = parseInt(document.getElementById('symptom-duration').value) || 12;

        const checkedRedFlags = [];
        document.querySelectorAll('#red-flags-container input[type="checkbox"]:checked').forEach(cb => {
            checkedRedFlags.push(cb.value);
        });

        const payload = {
            species: pet.species || 'Dog',
            symptom_id: selectedSymptom.id,
            duration_hours: durationHours,
            additional_flags: checkedRedFlags,
            age_stage: activeCareGuide ? activeCareGuide.age_stage : 'Adult',
            existing_conditions: pet.existing_conditions || []
        };

        try {
            const res = await fetch('/api/triage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await res.json();
            renderTriageResult(result);
            showTriageStep(3);
        } catch (err) {
            console.error("Triage submission error", err);
        }
    }

    function renderTriageResult(result) {
        const header = document.getElementById('result-status-header');
        const icon = document.getElementById('result-status-icon');
        const tag = document.getElementById('result-tag');
        const title = document.getElementById('result-title');
        const msg = document.getElementById('result-message');
        const emergencyCard = document.getElementById('emergency-action-card');
        const homeCareSection = document.getElementById('home-care-section');
        const homeCareList = document.getElementById('home-care-list');
        const escalationText = document.getElementById('escalation-text');

        header.className = `result-status-header severity-${result.severity}`;

        if (result.severity === 'EMERGENCY') {
            icon.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i>';
            tag.textContent = 'CRITICAL EMERGENCY';
            title.textContent = 'Seek Veterinary Care Immediately';
            msg.textContent = result.message;
            emergencyCard.classList.remove('hidden');
            homeCareSection.classList.add('hidden');
        } else if (result.severity === 'MODERATE') {
            icon.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
            tag.textContent = 'MODERATE CONDITION';
            title.textContent = 'Schedule Vet Checkup Soon';
            msg.textContent = result.message;
            emergencyCard.classList.add('hidden');
            homeCareSection.classList.remove('hidden');
        } else { // MILD
            icon.innerHTML = '<i class="fa-solid fa-shield-check"></i>';
            tag.textContent = 'MILD CONDITION';
            title.textContent = 'Monitor Comfortably at Home';
            msg.textContent = result.message;
            emergencyCard.classList.add('hidden');
            homeCareSection.classList.remove('hidden');
        }

        if (result.home_care) {
            homeCareList.innerHTML = result.home_care.map(step => `<li>${step}</li>`).join('');
        }

        escalationText.textContent = result.escalation_message || "If symptoms persist or worsen, contact your vet clinic.";
    }

    /* --------------------------------------------------------------------------
       MODULE 4: NEARBY VET CLINIC LOCATOR
       -------------------------------------------------------------------------- */
    function setupVetFinder() {
        document.getElementById('btn-use-location').addEventListener('click', getUserLocationAndSearch);
        document.getElementById('btn-search-vets').addEventListener('click', () => {
            const query = document.getElementById('vet-city-input').value.trim();
            fetchVetClinics(userLocation.lat, userLocation.lng, query);
        });
    }

    function getUserLocationAndSearch() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                    fetchVetClinics(userLocation.lat, userLocation.lng);
                },
                (err) => {
                    console.warn("Location access denied or failed, using default coords", err);
                    fetchVetClinics(userLocation.lat, userLocation.lng);
                }
            );
        } else {
            fetchVetClinics(userLocation.lat, userLocation.lng);
        }
    }

    async function fetchVetClinics(lat, lng, query = '') {
        try {
            let url = `/api/vets?lat=${lat}&lng=${lng}`;
            if (query) url += `&query=${encodeURIComponent(query)}`;
            const res = await fetch(url);
            vetClinics = await res.json();
            renderClinicsList(vetClinics);
            updateLeafletMapMarkers(lat, lng, vetClinics);
        } catch (err) {
            console.error("Vet fetch error", err);
        }
    }

    function renderClinicsList(clinics) {
        const container = document.getElementById('clinics-cards-container');
        document.getElementById('clinics-count-text').textContent = `Veterinary Clinics (${clinics.length} found)`;

        container.innerHTML = clinics.map(c => `
            <div class="clinic-card">
                <div class="clinic-top-row">
                    <div class="clinic-name">${c.name}</div>
                    ${c.emergency_24h ? '<span class="badge-24h"><i class="fa-solid fa-bolt"></i> 24/7 Emergency</span>' : ''}
                </div>
                <div class="clinic-meta">
                    <span><i class="fa-solid fa-location-dot"></i> ${c.distance_km} km away</span>
                    <span><i class="fa-solid fa-star text-amber"></i> ${c.rating}</span>
                </div>
                <p style="font-size:0.85rem; color:var(--color-text-muted);">${c.address}</p>
                <div class="clinic-actions">
                    <a href="tel:${c.phone}" class="btn-clinic-call"><i class="fa-solid fa-phone"></i> Call Clinic</a>
                    <a href="${c.maps_link}" target="_blank" class="btn-clinic-dir"><i class="fa-solid fa-directions"></i> Get Directions</a>
                </div>
            </div>
        `).join('');
    }

    function initLeafletMap() {
        if (mapInstance) {
            mapInstance.invalidateSize();
            return;
        }

        mapInstance = L.map('leaflet-vet-map').setView([userLocation.lat, userLocation.lng], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors'
        }).addTo(mapInstance);

        fetchVetClinics(userLocation.lat, userLocation.lng);
    }

    function updateLeafletMapMarkers(userLat, userLng, clinics) {
        if (!mapInstance) return;

        // Clear existing markers
        mapInstance.eachLayer(layer => {
            if (layer instanceof L.Marker) {
                mapInstance.removeLayer(layer);
            }
        });

        // User location marker
        L.marker([userLat, userLng]).addTo(mapInstance)
            .bindPopup("<b>You are here</b>").openPopup();

        // Clinic markers
        clinics.forEach(c => {
            L.marker([c.lat, c.lng]).addTo(mapInstance)
                .bindPopup(`<b>${c.name}</b><br>${c.phone}<br><a href="${c.maps_link}" target="_blank">Directions</a>`);
        });

        mapInstance.setView([userLat, userLng], 13);
    }

    /* --------------------------------------------------------------------------
       MODULE 5: REMINDERS DASHBOARD
       -------------------------------------------------------------------------- */
    function setupReminders() {
        renderRemindersList();

        document.getElementById('btn-open-add-reminder').addEventListener('click', () => {
            openModal('modal-add-reminder');
        });

        document.getElementById('form-add-reminder').addEventListener('submit', (e) => {
            e.preventDefault();
            const title = document.getElementById('rem-title').value.trim();
            const time = document.getElementById('rem-time').value;
            const category = document.getElementById('rem-category').value;

            if (!title) return;

            reminders.push({
                id: 'rem_' + Date.now(),
                title, time, category, completed: false
            });

            localStorage.setItem('pawguide_reminders', JSON.stringify(reminders));
            renderRemindersList();
            closeModal('modal-add-reminder');
            document.getElementById('form-add-reminder').reset();
        });
    }

    function renderRemindersList() {
        const container = document.getElementById('reminders-list-container');

        if (reminders.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:var(--color-text-muted); margin:2rem 0;">No active reminders set. Add meal times or vaccine checkups above!</p>';
            return;
        }

        container.innerHTML = reminders.map(r => `
            <div class="reminder-item ${r.completed ? 'completed' : ''}">
                <div class="reminder-left">
                    <input type="checkbox" class="reminder-check" data-id="${r.id}" ${r.completed ? 'checked' : ''}>
                    <div>
                        <strong>${r.title}</strong>
                        <span class="badge breed-badge" style="margin-left:0.5rem;">${r.category}</span>
                    </div>
                </div>
                <div class="reminder-time"><i class="fa-solid fa-clock"></i> ${r.time}</div>
            </div>
        `).join('');

        container.querySelectorAll('.reminder-check').forEach(cb => {
            cb.addEventListener('change', () => {
                const id = cb.getAttribute('data-id');
                const target = reminders.find(r => r.id === id);
                if (target) {
                    target.completed = cb.checked;
                    localStorage.setItem('pawguide_reminders', JSON.stringify(reminders));
                    renderRemindersList();
                }
            });
        });
    }

});
