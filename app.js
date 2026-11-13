(function() {
    const STORAGE_KEY = 'transit_diary';
    const THEME_KEY = 'transit_theme';
    const STATS_PERIOD_KEY = 'transit_stats_period';
    const OLD_KEYS = ['transit_pass', 'transit_pass_defaults'];

    const PERIODS = {
        day: { title: 'Итого за сегодня', days: 0 },
        week: { title: 'Итого за 7 дней', days: 6 },
        month: { title: 'Итого за 30 дней', days: 29 },
        all: { title: 'Итого за всё время', days: null }
    };

    const PRICES = {
        ground: { prepaid: 1.10, cash: 1.15 },
        metro: { fixed: 1.15 },
        carsharing: { fixed: 0 },
        taxi: { fixed: 0 },
        scooter: { fixed: 0 }
    };

    const TRANSPORT_LABELS = {
        ground: '🚌 Наземный',
        metro: '🚇 Метро',
        carsharing: '🚗 Каршеринг',
        taxi: '🚕 Такси',
        scooter: '🛴 Самокат'
    };

    let db = loadData();
    let longPressTimer = null;
    let editingTrip = null;
    let statsPeriod = loadStatsPeriod();

    const els = {};

    function loadData() {
        OLD_KEYS.forEach(k => localStorage.removeItem(k));
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return emptyDB();
            const parsed = JSON.parse(raw);
            if (parsed.pass && !parsed.passes) return migrateOld(parsed);
            return parsed;
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
            prices: PRICES,
            defaults: { transport: 'ground', payment: 'prepaid', duration: 30, enabledTransports: [] }
        };
    }

    function migrateOld(old) {
        const db = emptyDB();
        if (old.pass && old.pass.active) {
            const pass = {
                id: Date.now(),
                type: old.pass.type === 'universal' ? 'unlimited' : 'unlimited',
                start_date: old.pass.startDate,
                duration: old.pass.duration,
                expires_at: addDays(old.pass.startDate, old.pass.duration),
                total_trips: null,
                used_trips: 0,
                price: old.pass.price,
                status: 'active',
                created_at: now()
            };
            db.passes.push(pass);
            const types = old.pass.type === 'universal' ? ['ground', 'metro'] : [old.pass.type];
            types.forEach(t => db.pass_transport.push({ pass_id: pass.id, transport: t }));
            db.expenses.push({
                id: Date.now() + 1,
                ts: now(),
                type: 'pass',
                price: old.pass.price,
                payment: null,
                related_pass_id: pass.id,
                related_trip_id: null
            });
        }
        saveData(db);
        return db;
    }

    function saveData(d) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    }

    function loadStatsPeriod() {
        const saved = localStorage.getItem(STATS_PERIOD_KEY);
        return PERIODS[saved] ? saved : 'all';
    }

    function ymd(d) {
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }

    function today() {
        return ymd(new Date());
    }

    function now() {
        const d = new Date();
        return ymd(d) + 'T' +
            String(d.getHours()).padStart(2, '0') + ':' +
            String(d.getMinutes()).padStart(2, '0') + ':' +
            String(d.getSeconds()).padStart(2, '0');
    }

    function periodStart(period) {
        const days = PERIODS[period]?.days;
        if (days === null || days === undefined) return null;
        const d = new Date();
        d.setDate(d.getDate() - days);
        return ymd(d);
    }

    function inPeriod(ts, start) {
        return !start || ts.slice(0, 10) >= start;
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

    function formatMoney(amount) {
        return amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' BYN';
    }

    function formatDateShort(dateStr) {
        const d = new Date(dateStr);
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: '2-digit', year: 'numeric' });
    }

    function getActivePass() {
        const t = today();
        return db.passes.find(p =>
            p.status === 'active' && p.start_date <= t && t <= p.expires_at
        ) || null;
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
        const prices = db.prices || PRICES;
        if (transport === 'ground') return prices.ground?.prepaid ?? PRICES.ground.prepaid;
        if (transport === 'metro') return prices.metro?.fixed ?? PRICES.metro.fixed;
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

    function plural(n, one, few, many) {
        const n10 = n % 10;
        const n100 = n % 100;
        if (n10 === 1 && n100 !== 11) return one;
        if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
        return many;
    }

    function setPassStatsLine(pass) {
        const stats = passStats(pass);
        if (!stats.count) {
            els.passStatsLine.textContent = 'Поездок по проездному не было';
        } else {
            const tripsPart = `${stats.count} ${plural(stats.count, 'поездка', 'поездки', 'поездок')} · ${formatMoney(stats.perTrip)} за поездку`;
            const savingsPart = stats.savings >= 0
                ? `выгода ${formatMoney(stats.savings)}`
                : `переплата ${formatMoney(-stats.savings)}`;
            els.passStatsLine.textContent = `${tripsPart} · ${savingsPart}`;
        }
    }

    function init() {
        cacheElements();
        initTheme();
        bindEvents();
        render();
    }

    function cacheElements() {
        els.passCard = document.getElementById('pass-card');
        els.passInfoText = document.getElementById('pass-info-text');
        els.passProgressFill = document.getElementById('pass-progress-fill');
        els.passProgressText = document.getElementById('pass-progress-text');
        els.passRemaining = document.getElementById('pass-remaining');
        els.passStatsLine = document.getElementById('pass-stats-line');
        els.passExpiredBanner = document.getElementById('pass-expired-banner');
        els.passLostBanner = document.getElementById('pass-lost-banner');
        els.tripsButtons = document.getElementById('trips-buttons');
        els.todayTrips = document.getElementById('today-trips');
        els.todayTripsWord = document.getElementById('today-trips-word');
        els.todayExpenses = document.getElementById('today-expenses');
        els.statsTitle = document.getElementById('stats-title');
        els.statsPeriod = document.getElementById('stats-period');
        els.totalTrips = document.getElementById('total-trips');
        els.totalExpenses = document.getElementById('total-expenses');
        els.transportStats = document.getElementById('transport-stats');
        els.totalPassExpenses = document.getElementById('total-pass-expenses');
        els.totalTripExpenses = document.getElementById('total-trip-expenses');

        els.modal = document.getElementById('trip-modal');
        els.modalTime = document.getElementById('modal-time');
        els.modalTransport = document.getElementById('modal-transport');
        els.modalPrice = document.getElementById('modal-price');
        els.modalPayment = document.getElementById('modal-payment');
        els.modalSave = document.getElementById('modal-save');
        els.modalCancel = document.getElementById('modal-cancel');
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
        els.tripsButtons.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-trip-add');
            if (btn && !btn.disabled) {
                quickAddTrip(btn.dataset.transport);
            }
        });

        els.statsPeriod.addEventListener('click', (e) => {
            const btn = e.target.closest('.period-btn');
            if (!btn) return;
            statsPeriod = btn.dataset.period;
            localStorage.setItem(STATS_PERIOD_KEY, statsPeriod);
            renderTotals();
        });

        els.tripsButtons.addEventListener('mousedown', (e) => {
            const btn = e.target.closest('.btn-trip-add');
            if (btn) startLongPress(btn.dataset.transport, e);
        });

        els.tripsButtons.addEventListener('touchstart', (e) => {
            const btn = e.target.closest('.btn-trip-add');
            if (btn) startLongPress(btn.dataset.transport, e);
        }, { passive: true });

        document.addEventListener('mouseup', cancelLongPress);
        document.addEventListener('touchend', cancelLongPress);
        document.addEventListener('touchcancel', cancelLongPress);


        els.modalCancel.addEventListener('click', closeModal);
        els.modalSave.addEventListener('click', saveModal);
        els.modalTransport.addEventListener('change', () => {
            const t = els.modalTransport.value;
            const price = PRICES[t]?.prepaid || PRICES[t]?.fixed || 0;
            els.modalPrice.value = price.toFixed(2);
        });

        els.modal.addEventListener('click', (e) => {
            if (e.target === els.modal) closeModal();
        });
    }

    function startLongPress(transport, e) {
        cancelLongPress();
        longPressTimer = setTimeout(() => {
            longPressTimer = null;
            openModal(transport);
        }, 500);
    }

    function cancelLongPress() {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    }

    const PASS_TRANSPORTS = ['ground', 'metro', 'scooter'];
    const POPUP_TRANSPORTS = ['carsharing', 'taxi', 'scooter'];

    function quickAddTrip(transport) {
        if (longPressTimer) {
            cancelLongPress();
        }

        if (POPUP_TRANSPORTS.includes(transport)) {
            openModal(transport);
            return;
        }
        const pass = getActivePass();
        const ts = now();

        if (pass && passHasTripsLeft(pass) && passCoversTransport(pass, transport)) {
            const trip = { id: Date.now(), ts, transport, pass_id: pass.id };
            db.trips.push(trip);
            if (pass.type === 'fixed') {
                pass.used_trips++;
            }
        } else {
            const trip = { id: Date.now(), ts, transport, pass_id: null };
            db.trips.push(trip);
            const price = PRICES[transport]?.prepaid || PRICES[transport]?.fixed || 0;
            db.expenses.push({
                id: Date.now() + 1,
                ts,
                type: 'trip',
                price,
                payment: 'prepaid',
                related_pass_id: null,
                related_trip_id: trip.id
            });
        }

        saveData(db);
        render();
    }

    function openModal(transport) {
        editingTrip = { transport };
        const pass = getActivePass();
        const hasPassForType = pass && passHasTripsLeft(pass) && PASS_TRANSPORTS.includes(transport) && passCoversTransport(pass, transport);

        els.modalTime.value = new Date().toTimeString().slice(0, 5);
        els.modalTransport.value = transport;

        const price = PRICES[transport]?.prepaid || PRICES[transport]?.fixed || 0;
        els.modalPrice.value = price.toFixed(2);

        els.modalPayment.innerHTML = '';
        if (hasPassForType) {
            els.modalPayment.innerHTML = '<option value="pass">Проездной</option>';
        }
        els.modalPayment.innerHTML += '<option value="prepaid">Предоплата</option><option value="cash">Наличные</option>';
        els.modalPayment.value = hasPassForType ? 'pass' : 'prepaid';

        els.modal.classList.add('active');
    }

    function closeModal() {
        els.modal.classList.remove('active');
        editingTrip = null;
    }

    function saveModal() {
        if (!editingTrip) return;

        const time = els.modalTime.value || '00:00';
        const transport = els.modalTransport.value;
        const price = parseFloat(els.modalPrice.value) || 0;
        const payment = els.modalPayment.value;

        const todayStr = today();
        const ts = `${todayStr}T${time}:00`;

        const pass = getActivePass();

        if (payment === 'pass' && pass && passHasTripsLeft(pass) && passCoversTransport(pass, transport)) {
            const trip = { id: Date.now(), ts, transport, pass_id: pass.id };
            db.trips.push(trip);
            if (pass.type === 'fixed') {
                pass.used_trips++;
            }
        } else {
            const trip = { id: Date.now(), ts, transport, pass_id: null };
            db.trips.push(trip);
            db.expenses.push({
                id: Date.now() + 1,
                ts,
                type: 'trip',
                price,
                payment,
                related_pass_id: null,
                related_trip_id: trip.id
            });
        }

        saveData(db);
        closeModal();
        render();
    }

    function render() {
        renderPassCard();
        renderButtons();
        renderTodayStats();
        renderTotals();
    }

    function renderButtons() {
        const pass = getActivePass();
        const enabled = db.defaults?.enabledTransports || [];

        const passTransports = pass
            ? db.pass_transport.filter(pt => pt.pass_id === pass.id).map(pt => pt.transport)
            : [];

        const allTransports = [...new Set([...passTransports, ...enabled])];

        els.tripsButtons.innerHTML = allTransports.map(t => {
            const label = TRANSPORT_LABELS[t] || t;
            return `<button class="btn-trip-add" data-transport="${t}">${label}</button>`;
        }).join('');
    }

    function renderPassCard() {
        const pass = getActivePass();
        const lostPass = latestPass(p => p.status === 'lost');
        const expiredPass = latestPass(p => p.status === 'active' && today() > p.expires_at);
        const showLost = lostPass && (!expiredPass || lostPass.id > expiredPass.id);

        els.passCard.classList.toggle('hidden', !pass && !lostPass && !expiredPass);

        if (pass) {
            els.passExpiredBanner.classList.add('hidden');
            els.passLostBanner.classList.add('hidden');

            const transportNames = db.pass_transport
                .filter(pt => pt.pass_id === pass.id)
                .map(pt => TRANSPORT_LABELS[pt.transport] || pt.transport)
                .join(' + ');

            const typeLabel = pass.type === 'unlimited' ? 'Безлимитный' : `На ${pass.total_trips} поездок`;
            els.passInfoText.textContent = `${typeLabel} · ${transportNames}`;

            if (pass.type === 'unlimited') {
                const daysTotal = pass.duration;
                const daysUsed = Math.min(daysBetween(pass.start_date, today()) + 1, daysTotal);
                const pct = Math.min(100, (daysUsed / daysTotal) * 100);
                els.passProgressFill.style.width = pct + '%';
                els.passProgressText.textContent = `${daysUsed} / ${daysTotal} дней`;
                const remaining = daysTotal - daysUsed;
                els.passRemaining.textContent = remaining > 0 ? `Осталось ${remaining} дн.` : 'Последний день';
            } else {
                const tripsLeft = pass.total_trips - pass.used_trips;
                const daysLeft = Math.max(0, daysBetween(today(), pass.expires_at));
                const pct = Math.min(100, (pass.used_trips / pass.total_trips) * 100);
                els.passProgressFill.style.width = pct + '%';
                els.passProgressText.textContent = `${pass.used_trips} / ${pass.total_trips} поездок`;
                els.passRemaining.textContent = `Осталось ${tripsLeft} поездок · ${daysLeft} дн.`;
            }
            setPassStatsLine(pass);
        } else if (showLost) {
            els.passExpiredBanner.classList.add('hidden');
            els.passLostBanner.classList.remove('hidden');
            els.passInfoText.textContent = '';
            els.passProgressFill.style.width = '0%';
            els.passProgressText.textContent = '';
            els.passRemaining.textContent = '';
            setPassStatsLine(lostPass);
        } else if (expiredPass) {
            els.passExpiredBanner.classList.remove('hidden');
            els.passLostBanner.classList.add('hidden');
            els.passInfoText.textContent = '';
            els.passProgressFill.style.width = '100%';
            els.passProgressText.textContent = '';
            els.passRemaining.textContent = '';
            setPassStatsLine(expiredPass);
        }
    }

    function renderTodayStats() {
        const t = today();
        const todayTrips = db.trips.filter(tr => tr.ts.startsWith(t));
        const todayExpenses = db.expenses.filter(ex => ex.ts.startsWith(t));

        els.todayTrips.textContent = todayTrips.length;
        els.todayTripsWord.textContent = plural(todayTrips.length, 'поездка', 'поездки', 'поездок');
        const totalExp = todayExpenses.reduce((s, e) => s + e.price, 0);
        els.todayExpenses.textContent = formatMoney(totalExp);
    }

    function renderTotals() {
        const start = periodStart(statsPeriod);
        const trips = db.trips.filter(t => inPeriod(t.ts, start));
        const expenses = db.expenses.filter(e => inPeriod(e.ts, start));

        const totalTrips = trips.length;
        const totalExpenses = expenses.reduce((s, e) => s + e.price, 0);

        const transportCounts = {};
        trips.forEach(t => {
            transportCounts[t.transport] = (transportCounts[t.transport] || 0) + 1;
        });

        els.statsTitle.textContent = PERIODS[statsPeriod].title;
        els.statsPeriod.querySelectorAll('.period-btn').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.period === statsPeriod);
        });

        const transportRows = Object.keys(TRANSPORT_LABELS)
            .filter(t => transportCounts[t])
            .map(t => `<div class="stat-row">
                <span>${TRANSPORT_LABELS[t]}</span>
                <span><strong>${transportCounts[t]}</strong></span>
            </div>`).join('');

        els.transportStats.innerHTML = transportRows ||
            '<div class="stat-row stat-empty"><span>Поездок за период нет</span></div>';

        const passExpenses = expenses.filter(e => e.type === 'pass').reduce((s, e) => s + e.price, 0);
        const tripExpenses = expenses.filter(e => e.type === 'trip').reduce((s, e) => s + e.price, 0);

        els.totalTrips.textContent = totalTrips;
        els.totalExpenses.textContent = formatMoney(totalExpenses);
        els.totalPassExpenses.textContent = formatMoney(passExpenses);
        els.totalTripExpenses.textContent = formatMoney(tripExpenses);
    }

    init();
})();
