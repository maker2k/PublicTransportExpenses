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
        const [y, m, day] = dateStr.split('-').map(Number);
        const d = new Date(y, m - 1, day);
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

    function formatMoney(amount) {
        return amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' BYN';
    }

    function plural(n, one, few, many) {
        const n10 = n % 10;
        const n100 = n % 100;
        if (n10 === 1 && n100 !== 11) return one;
        if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
        return many;
    }

    function getActivePass() {
        const t = today();
        return db.passes.find(p =>
            p.status === 'active' && p.start_date <= t && t < p.expires_at
        ) || null;
    }

    // expires_at — граница действия (день, когда проездной уже не действует)
    function isPassExpired(pass) {
        return today() >= pass.expires_at;
    }

    function passLastDay(pass) {
        return addDays(pass.expires_at, -1);
    }

    function latestPass(predicate) {
        return db.passes
            .filter(predicate)
            .sort((a, b) => b.id - a.id)[0] || null;
    }

    function passHasTripsLeft(pass) {
        return pass.type === 'unlimited' || pass.used_trips < pass.total_trips;
    }

    function passCoversTransport(pass, transport) {
        return db.pass_transport.some(pt => pt.pass_id === pass.id && pt.transport === transport);
    }

    function unitPrice(transport) {
        const prices = db.prices || emptyDB().prices;
        if (transport === 'ground') return prices.ground?.prepaid ?? 1.10;
        if (transport === 'metro') return prices.metro?.fixed ?? 1.15;
        return 0;
    }

    function passStats(pass) {
        const trips = db.trips.filter(t => t.pass_id === pass.id);
        const count = trips.length;
        const single = trips.reduce((s, t) => s + unitPrice(t.transport), 0);
        return {
            count,
            perTrip: count ? pass.price / count : null,
            savings: single - pass.price
        };
    }

    function passStatsHtml(pass) {
        const stats = passStats(pass);
        if (!stats.count) {
            return '<div class="pass-history-stats"><span>Поездок по проездному не было</span></div>';
        }

        const tripsPart = `${stats.count} ${plural(stats.count, 'поездка', 'поездки', 'поездок')} · ${formatMoney(stats.perTrip)} за поездку`;
        const savingsClass = stats.savings >= 0 ? 'saving-good' : 'saving-bad';
        const savingsLabel = stats.savings >= 0 ? 'выгода' : 'переплата';

        return `<div class="pass-history-stats">
            <span>${tripsPart}</span>
            <span class="${savingsClass}">${savingsLabel} ${formatMoney(Math.abs(stats.savings))}</span>
        </div>`;
    }

    function renderPassStatsLine(pass) {
        const el = document.getElementById('pass-trips-stats');
        const stats = passStats(pass);
        if (!stats.count) {
            el.textContent = 'Поездок по проездному пока нет';
        } else {
            const tripsPart = `${stats.count} ${plural(stats.count, 'поездка', 'поездки', 'поездок')} · ${formatMoney(stats.perTrip)} за поездку`;
            const savingsPart = stats.savings >= 0
                ? `выгода ${formatMoney(stats.savings)}`
                : `переплата ${formatMoney(-stats.savings)}`;
            el.textContent = `${tripsPart} · ${savingsPart}`;
        }
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
                updatePlan();
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
                updatePlan();
            });
        });

        document.getElementById('btn-create-pass').addEventListener('click', createPass);
        document.getElementById('btn-pass-settings').addEventListener('click', toggleSettingsMenu);
        document.getElementById('plan-header').addEventListener('click', () => {
            document.getElementById('plan-dates').classList.toggle('hidden');
        });
        document.getElementById('btn-lose-pass').addEventListener('click', () => {
            if (confirm('Потерять проездной?')) {
                const pass = getActivePass();
                if (pass) { pass.status = 'lost'; saveData(db); render(); }
            }
        });
        document.getElementById('btn-restore-pass').addEventListener('click', () => {
            const lost = db.passes.find(p => p.status === 'lost');
            if (lost) { lost.status = 'active'; saveData(db); render(); }
        });
        document.getElementById('btn-delete-pass').addEventListener('click', () => {
            if (confirm('Удалить проездной?')) {
                const target = getActivePass() || db.passes.find(p => p.status === 'lost') || db.passes.find(p => p.status === 'active' && isPassExpired(p));
                if (target) { deletePassById(target.id); render(); }
            }
        });
    }

    function toggleSettingsMenu() {
        document.getElementById('pass-settings-menu').classList.toggle('hidden');
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
        if (!getActivePass()) updatePlan();
    }

    function renderActivePass() {
        const pass = getActivePass();
        const lostPass = latestPass(p => p.status === 'lost');
        const expiredPass = latestPass(p => p.status === 'active' && isPassExpired(p));
        const showLost = lostPass && (!expiredPass || lostPass.id > expiredPass.id);

        const card = document.getElementById('pass-active-card');
        const createSection = document.getElementById('pass-create-section');

        if (pass) {
            card.classList.remove('hidden');
            createSection.classList.add('hidden');
            document.getElementById('pass-expired-banner').classList.add('hidden');
            document.getElementById('pass-lost-banner').classList.add('hidden');
            document.getElementById('btn-pass-settings').classList.remove('hidden');
            document.getElementById('btn-lose-pass').classList.remove('hidden');
            document.getElementById('btn-restore-pass').classList.add('hidden');
            document.getElementById('btn-delete-pass').classList.remove('hidden');
            document.getElementById('pass-settings-menu').classList.add('hidden');

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
            renderPassStatsLine(pass);
        } else if (showLost) {
            card.classList.remove('hidden');
            document.getElementById('pass-expired-banner').classList.add('hidden');
            document.getElementById('pass-lost-banner').classList.remove('hidden');
            document.getElementById('btn-pass-settings').classList.remove('hidden');
            document.getElementById('pass-info-text').textContent = 'Проездной потерян';
            document.getElementById('pass-progress-fill').style.width = '0%';
            document.getElementById('pass-progress-text').textContent = '';
            document.getElementById('pass-remaining').textContent = '';
            document.getElementById('btn-lose-pass').classList.add('hidden');
            document.getElementById('btn-restore-pass').classList.remove('hidden');
            document.getElementById('btn-delete-pass').classList.remove('hidden');
            document.getElementById('pass-settings-menu').classList.add('hidden');
            renderPassStatsLine(lostPass);
        } else if (expiredPass) {
            card.classList.remove('hidden');
            document.getElementById('pass-expired-banner').classList.remove('hidden');
            document.getElementById('pass-lost-banner').classList.add('hidden');
            document.getElementById('btn-pass-settings').classList.remove('hidden');
            document.getElementById('pass-info-text').textContent = 'Проездной истёк';
            document.getElementById('pass-progress-fill').style.width = '100%';
            document.getElementById('pass-progress-text').textContent = '';
            document.getElementById('pass-remaining').textContent = '';
            document.getElementById('btn-lose-pass').classList.add('hidden');
            document.getElementById('btn-restore-pass').classList.add('hidden');
            document.getElementById('btn-delete-pass').classList.remove('hidden');
            document.getElementById('pass-settings-menu').classList.add('hidden');
            renderPassStatsLine(expiredPass);
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

            const status = p.status === 'active' && isPassExpired(p) ? 'expired' : p.status;
            const statusLabels = { active: 'Действует', lost: 'Потерян', expired: 'Истёк' };
            const typeLabel = p.type === 'unlimited' ? 'Безлимитный' : `На ${p.total_trips} поездок`;

            return `<div class="pass-history-item">
                <div class="stat-row">
                    <span>${typeLabel} · ${transportNames}</span>
                    <span>${formatMoney(p.price)}</span>
                </div>
                <div class="stat-row">
                    <span class="pass-history-dates">${formatDateShort(p.start_date)} — ${formatDateShort(passLastDay(p))}</span>
                    <span class="pass-history-status">${statusLabels[status] || status}</span>
                </div>
                ${passStatsHtml(p)}
            </div>`;
        }).join('');
    }

    function getHolidays(year) {
        const holidays = [
            `${year}-01-01`, `${year}-01-02`, `${year}-01-03`,
            `${year}-01-07`,
            `${year}-03-08`,
            `${year}-05-01`,
            `${year}-05-09`,
            `${year}-07-03`,
            `${year}-11-02`,
            `${year}-12-25`,
        ];
        return new Set(holidays);
    }

    function countUnprofitableDays(startDate, duration) {
        const holidays = getHolidays(new Date(startDate).getFullYear());
        let count = 0;
        for (let i = 0; i < duration; i++) {
            const d = new Date(startDate);
            d.setDate(d.getDate() + i);
            const dow = d.getDay();
            const dateStr = d.getFullYear() + '-' +
                String(d.getMonth() + 1).padStart(2, '0') + '-' +
                String(d.getDate()).padStart(2, '0');
            if (dow === 0 || dow === 6 || holidays.has(dateStr)) {
                count++;
            }
        }
        return count;
    }

    function findBestDates(duration) {
        const results = [];
        const todayDate = new Date();
        const maxOffset = Math.min(duration, 14);
        for (let offset = 0; offset <= maxOffset; offset++) {
            const d = new Date(todayDate);
            d.setDate(d.getDate() + offset);
            const dateStr = d.getFullYear() + '-' +
                String(d.getMonth() + 1).padStart(2, '0') + '-' +
                String(d.getDate()).padStart(2, '0');
            const unprofitable = countUnprofitableDays(dateStr, duration);
            results.push({ date: dateStr, unprofitable });
        }
        results.sort((a, b) => a.unprofitable - b.unprofitable || a.date.localeCompare(b.date));
        const seen = new Set();
        const unique = [];
        for (const item of results) {
            if (!seen.has(item.unprofitable)) {
                seen.add(item.unprofitable);
                unique.push(item);
            }
            if (unique.length >= 2) break;
        }
        return unique;
    }

    function updatePlan() {
        const isUnlimited = selectedPassType === 'unlimited';
        const durations = isUnlimited ? [10, 15, 30] : [120, 365];
        const container = document.getElementById('plan-dates');
        container.innerHTML = durations.map(dur => {
            const isCurrent = dur === selectedDuration;
            const dates = findBestDates(dur);
            const rows = dates.map((item, i) => {
                const label = i === 0 ? 'Лучше всего' : 'Хороший вариант';
                const unprofitableWord = item.unprofitable === 1 ? 'выходной' : item.unprofitable < 5 ? 'выходных' : 'выходных';
                return `<div class="plan-row">
                    <span class="plan-label">${label}</span>
                    <span class="plan-date">${formatDateShort(item.date)}</span>
                    <span class="plan-count">${item.unprofitable} ${unprofitableWord} (праздн.)</span>
                </div>`;
            }).join('');
            return `<div class="plan-section${isCurrent ? ' plan-current' : ''}">
                <div class="plan-section-title">${dur} суток${isCurrent ? ' ★' : ''}</div>
                ${rows}
            </div>`;
        }).join('');
    }

    init();
})();
