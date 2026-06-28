(function() {
    const STORAGE_KEY = 'transit_diary';
    const THEME_KEY = 'transit_theme';

    const TRANSPORT_LABELS = {
        ground: '🚌 Наземный',
        metro: '🚇 Метро',
        carsharing: '🚗 Каршеринг',
        taxi: '🚕 Такси',
        scooter: '🛴 Самокат'
    };

    let db = loadData();
    let selectedPassType = 'unlimited';
    let selectedTransport = ['ground'];
    let selectedDuration = 30;

    function loadData() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return emptyDB();
            return JSON.parse(raw);
        } catch {
            return emptyDB();
        }
    }

    function emptyDB() {
        return {
            passes: [],
            pass_transport: [],
            trips: [],
            expenses: [],
            prices: { ground: { prepaid: 1.10, cash: 1.15 }, metro: { fixed: 1.15 } },
            defaults: { transport: 'ground', payment: 'prepaid', duration: 30, enabledTransports: [] }
        };
    }

    function saveData(d) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    }

    function today() {
        const d = new Date();
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }

    function now() {
        const d = new Date();
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0') + 'T' +
            String(d.getHours()).padStart(2, '0') + ':' +
            String(d.getMinutes()).padStart(2, '0') + ':' +
            String(d.getSeconds()).padStart(2, '0');
    }

    function addDays(dateStr, days) {
        const d = new Date(dateStr);
        d.setDate(d.getDate() + days);
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }

    function daysBetween(a, b) {
        const da = new Date(a);
        const db = new Date(b);
        return Math.floor((db - da) / 86400000);
    }

    function formatDateShort(dateStr) {
        const d = new Date(dateStr);
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: '2-digit', year: 'numeric' });
    }

    function getActivePass() {
        const t = today();
        return db.passes.find(p =>
            p.status === 'active' && t <= p.expires_at
        ) || null;
    }

    function passCoversTransport(pass, transport) {
        return db.pass_transport.some(pt => pt.pass_id === pass.id && pt.transport === transport);
    }

    function init() {
        initTheme();
        bindEvents();
        render();
        updateFormState();
    }

    function initTheme() {
        const saved = localStorage.getItem(THEME_KEY) || 'light';
        applyTheme(saved);
        document.getElementById('btn-theme').addEventListener('click', toggleTheme);
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        document.getElementById('btn-theme').textContent = theme === 'dark' ? '☀️' : '🌙';
    }

    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        localStorage.setItem(THEME_KEY, next);
        applyTheme(next);
    }

    function bindEvents() {
        document.querySelectorAll('.pass-type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.pass-type-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedPassType = btn.dataset.type;
                updateFormState();
            });
        });

        document.querySelectorAll('.transport-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.classList.toggle('selected');
                selectedTransport = Array.from(document.querySelectorAll('.transport-btn.selected'))
                    .map(b => b.dataset.transport);
                if (selectedTransport.length === 0) {
                    btn.classList.add('selected');
                    selectedTransport = [btn.dataset.transport];
                }
            });
        });

        document.querySelectorAll('.duration-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const group = btn.closest('.form-group');
                group.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedDuration = parseInt(btn.dataset.days);
            });
        });

        document.getElementById('btn-create-pass').addEventListener('click', createPass);
    }

    function updateFormState() {
        const isFixed = selectedPassType === 'fixed';
        document.getElementById('duration-unlimited').classList.toggle('hidden', isFixed);
        document.getElementById('duration-fixed').classList.toggle('hidden', !isFixed);
        document.getElementById('total-trips-group').classList.toggle('hidden', !isFixed);
    }

    function createPass() {
        const startDate = document.getElementById('start-date').value || today();
        const price = parseFloat(document.getElementById('pass-price').value);

        if (!price || price <= 0) {
            alert('Введите стоимость проездного');
            return;
        }

        if (selectedPassType === 'fixed') {
            const totalTrips = parseInt(document.getElementById('total-trips-input').value);
            if (!totalTrips || totalTrips <= 0) {
                alert('Введите количество поездок');
                return;
            }

            const pass = {
                id: Date.now(),
                type: 'fixed',
                start_date: startDate,
                duration: selectedDuration,
                expires_at: addDays(startDate, selectedDuration),
                total_trips: totalTrips,
                used_trips: 0,
                price,
                status: 'active',
                created_at: now()
            };
            db.passes.push(pass);
            selectedTransport.forEach(t => {
                db.pass_transport.push({ pass_id: pass.id, transport: t });
            });
            db.expenses.push({
                id: Date.now() + 1,
                ts: now(),
                type: 'pass',
                price,
                payment: null,
                related_pass_id: pass.id,
                related_trip_id: null
            });
        } else {
            const pass = {
                id: Date.now(),
                type: 'unlimited',
                start_date: startDate,
                duration: selectedDuration,
                expires_at: addDays(startDate, selectedDuration),
                total_trips: null,
                used_trips: 0,
                price,
                status: 'active',
                created_at: now()
            };
            db.passes.push(pass);
            selectedTransport.forEach(t => {
                db.pass_transport.push({ pass_id: pass.id, transport: t });
            });
            db.expenses.push({
                id: Date.now() + 1,
                ts: now(),
                type: 'pass',
                price,
                payment: null,
                related_pass_id: pass.id,
                related_trip_id: null
            });
        }

        saveData(db);
        render();
        alert('Проездной создан');
    }

    function render() {
        renderActivePass();
        renderHistory();
    }

    function renderActivePass() {
        const pass = getActivePass();
        const lostPass = db.passes.find(p => p.status === 'lost');
        const expiredPass = db.passes.find(p => p.status === 'active' && today() > p.expires_at);

        const card = document.getElementById('pass-active-card');
        const createSection = document.getElementById('pass-create-section');

        if (pass) {
            card.classList.remove('hidden');
            createSection.classList.add('hidden');
            document.getElementById('pass-expired-banner').classList.add('hidden');
            document.getElementById('pass-lost-banner').classList.add('hidden');
            document.getElementById('btn-lose-pass').classList.remove('hidden');
            document.getElementById('btn-restore-pass').classList.add('hidden');
            document.getElementById('btn-delete-pass').classList.add('hidden');

            const transportNames = db.pass_transport
                .filter(pt => pt.pass_id === pass.id)
                .map(pt => TRANSPORT_LABELS[pt.transport] || pt.transport)
                .join(' + ');

            const typeLabel = pass.type === 'unlimited' ? 'Безлимитный' : `На ${pass.total_trips} поездок`;
            document.getElementById('pass-info-text').textContent = `${typeLabel} · ${transportNames}`;

            if (pass.type === 'unlimited') {
                const daysTotal = pass.duration;
                const daysUsed = Math.min(daysBetween(pass.start_date, today()) + 1, daysTotal);
                const pct = Math.min(100, (daysUsed / daysTotal) * 100);
                document.getElementById('pass-progress-fill').style.width = pct + '%';
                document.getElementById('pass-progress-text').textContent = `${daysUsed} / ${daysTotal} дней`;
                const remaining = daysTotal - daysUsed;
                document.getElementById('pass-remaining').textContent = remaining > 0 ? `Осталось ${remaining} дн.` : 'Последний день';
            } else {
                const tripsLeft = pass.total_trips - pass.used_trips;
                const daysLeft = Math.max(0, daysBetween(today(), pass.expires_at));
                const pct = Math.min(100, (pass.used_trips / pass.total_trips) * 100);
                document.getElementById('pass-progress-fill').style.width = pct + '%';
                document.getElementById('pass-progress-text').textContent = `${pass.used_trips} / ${pass.total_trips} поездок`;
                document.getElementById('pass-remaining').textContent = `Осталось ${tripsLeft} поездок · ${daysLeft} дн.`;
            }

            document.getElementById('btn-lose-pass').onclick = () => {
                if (confirm('Потерять проездной?')) {
                    pass.status = 'lost';
                    saveData(db);
                    render();
                }
            };
        } else if (lostPass) {
            card.classList.remove('hidden');
            createSection.classList.add('hidden');
            document.getElementById('pass-expired-banner').classList.add('hidden');
            document.getElementById('pass-lost-banner').classList.remove('hidden');
            document.getElementById('pass-info-text').textContent = 'Проездной потерян';
            document.getElementById('pass-progress-fill').style.width = '0%';
            document.getElementById('pass-progress-text').textContent = '';
            document.getElementById('pass-remaining').textContent = '';
            document.getElementById('btn-lose-pass').classList.add('hidden');
            document.getElementById('btn-restore-pass').classList.remove('hidden');
            document.getElementById('btn-delete-pass').classList.remove('hidden');

            document.getElementById('btn-restore-pass').onclick = () => {
                lostPass.status = 'active';
                saveData(db);
                render();
            };
            document.getElementById('btn-delete-pass').onclick = () => {
                if (confirm('Удалить проездной?')) {
                    deletePassById(lostPass.id);
                    render();
                }
            };
        } else if (expiredPass) {
            card.classList.remove('hidden');
            createSection.classList.add('hidden');
            document.getElementById('pass-expired-banner').classList.remove('hidden');
            document.getElementById('pass-lost-banner').classList.add('hidden');
            document.getElementById('pass-info-text').textContent = 'Проездной истёк';
            document.getElementById('pass-progress-fill').style.width = '100%';
            document.getElementById('pass-progress-text').textContent = '';
            document.getElementById('pass-remaining').textContent = '';
            document.getElementById('btn-lose-pass').classList.add('hidden');
            document.getElementById('btn-restore-pass').classList.add('hidden');
            document.getElementById('btn-delete-pass').classList.remove('hidden');

            document.getElementById('btn-delete-pass').onclick = () => {
                if (confirm('Удалить проездной?')) {
                    deletePassById(expiredPass.id);
                    render();
                }
            };
        } else {
            card.classList.add('hidden');
            createSection.classList.remove('hidden');
        }
    }

    function deletePassById(passId) {
        db.pass_transport = db.pass_transport.filter(pt => pt.pass_id !== passId);
        db.trips.forEach(t => { if (t.pass_id === passId) t.pass_id = null; });
        db.expenses = db.expenses.filter(e => e.related_pass_id !== passId);
        db.passes = db.passes.filter(p => p.id !== passId);
        saveData(db);
    }

    function renderHistory() {
        const allPasses = db.passes.slice().sort((a, b) => b.id - a.id);
        const section = document.getElementById('pass-history-section');
        const list = document.getElementById('pass-history-list');

        if (allPasses.length === 0) {
            section.classList.add('hidden');
            return;
        }

        section.classList.remove('hidden');
        list.innerHTML = allPasses.map(p => {
            const transportNames = db.pass_transport
                .filter(pt => pt.pass_id === p.id)
                .map(pt => TRANSPORT_LABELS[pt.transport] || pt.transport)
                .join(' + ');

            const statusLabels = { active: 'Действует', lost: 'Потерян', expired: 'Истёк' };
            const typeLabel = p.type === 'unlimited' ? 'Безлимитный' : `На ${p.total_trips} поездок`;

            return `<div class="stat-row">
                <span>${typeLabel} · ${transportNames}</span>
                <span>${p.price.toLocaleString('ru-RU')} BYN</span>
            </div>
            <div class="stat-row">
                <span style="font-size:0.8rem;color:var(--text-secondary)">${formatDateShort(p.start_date)} — ${formatDateShort(p.expires_at)}</span>
                <span style="font-size:0.8rem;color:var(--text-secondary)">${statusLabels[p.status] || p.status}</span>
            </div>`;
        }).join('<div class="stat-divider"></div>');
    }

    init();
})();
