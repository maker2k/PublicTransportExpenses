(function() {
    const STORAGE_KEY = 'transit_diary';
    const THEME_KEY = 'transit_theme';
    const PERIOD_KEY = 'transit_journal_period';

    const PERIODS = {
        day: { days: 0, empty: 'Сегодня поездок нет' },
        week: { days: 6, empty: 'За 7 дней поездок нет' },
        month: { days: 29, empty: 'За 30 дней поездок нет' },
        all: { days: null, empty: 'Пока нет поездок' }
    };

    const TRANSPORT_LABELS = {
        ground: '🚌 Наземный',
        metro: '🚇 Метро',
        carsharing: '🚗 Каршеринг',
        taxi: '🚕 Такси',
        scooter: '🛴 Самокат'
    };

    let period = loadPeriod();

    function loadData() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return { passes: [], pass_transport: [], trips: [], expenses: [], defaults: { enabledTransports: [] } };
            return JSON.parse(raw);
        } catch {
            return { passes: [], pass_transport: [], trips: [], expenses: [], defaults: { enabledTransports: [] } };
        }
    }

    function loadPeriod() {
        const saved = localStorage.getItem(PERIOD_KEY);
        return PERIODS[saved] ? saved : 'day';
    }

    function ymd(d) {
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }

    function today() {
        return ymd(new Date());
    }

    function yesterday() {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return ymd(d);
    }

    function periodStart() {
        const days = PERIODS[period].days;
        if (days === null) return null;
        const d = new Date();
        d.setDate(d.getDate() - days);
        return ymd(d);
    }

    function inPeriod(ts, start) {
        return !start || ts.slice(0, 10) >= start;
    }

    function formatTime(isoStr) {
        const d = new Date(isoStr);
        return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }

    function formatMoney(amount) {
        return amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' BYN';
    }

    function formatDateFull(dateStr) {
        const [y, m, d] = dateStr.split('-').map(Number);
        return new Date(y, m - 1, d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    function dayLabel(dateStr) {
        if (dateStr === today()) return 'Сегодня · ' + formatDateFull(dateStr);
        if (dateStr === yesterday()) return 'Вчера · ' + formatDateFull(dateStr);
        return formatDateFull(dateStr);
    }

    function plural(n, one, few, many) {
        const n10 = n % 10;
        const n100 = n % 100;
        if (n10 === 1 && n100 !== 11) return one;
        if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
        return many;
    }

    function saveData(d) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    }

    function init() {
        initTheme();
        bindEvents();
        render();
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
        document.getElementById('btn-undo').addEventListener('click', undoLast);
        document.getElementById('journal-period').addEventListener('click', (e) => {
            const btn = e.target.closest('.period-btn');
            if (!btn) return;
            period = btn.dataset.period;
            localStorage.setItem(PERIOD_KEY, period);
            render();
        });
    }

    function filteredTrips(db) {
        const start = periodStart();
        return db.trips
            .filter(tr => inPeriod(tr.ts, start))
            .sort((a, b) => b.ts.localeCompare(a.ts));
    }

    function undoLast() {
        if (!confirm('Отменить последнюю поездку?')) return;
        const db = loadData();
        const trips = filteredTrips(db);
        if (trips.length === 0) return;

        const lastTrip = trips[0];
        const lastIdx = db.trips.findIndex(tr => tr.id === lastTrip.id);
        if (lastIdx < 0) return;

        db.trips.splice(lastIdx, 1);

        if (lastTrip.pass_id) {
            const pass = db.passes.find(p => p.id === lastTrip.pass_id);
            if (pass && pass.type === 'fixed' && pass.used_trips > 0) {
                pass.used_trips--;
            }
        } else {
            const expIdx = db.expenses.findIndex(e => e.related_trip_id === lastTrip.id);
            if (expIdx >= 0) db.expenses.splice(expIdx, 1);
        }

        saveData(db);
        render();
    }

    function render() {
        const db = loadData();
        const trips = filteredTrips(db);

        document.getElementById('journal-period').querySelectorAll('.period-btn').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.period === period);
        });

        renderSummary(db, trips);

        const emptyEl = document.getElementById('journal-empty');
        const listEl = document.getElementById('journal-list');
        const undoEl = document.getElementById('btn-undo');

        undoEl.classList.toggle('hidden', trips.length === 0);

        if (trips.length === 0) {
            emptyEl.textContent = PERIODS[period].empty;
            emptyEl.classList.remove('hidden');
            listEl.classList.add('hidden');
            return;
        }

        emptyEl.classList.add('hidden');
        listEl.classList.remove('hidden');

        const byDate = new Map();
        trips.forEach(trip => {
            const day = trip.ts.slice(0, 10);
            if (!byDate.has(day)) byDate.set(day, []);
            byDate.get(day).push(trip);
        });

        listEl.innerHTML = Array.from(byDate.keys()).map(day =>
            `<div class="journal-day-title">${dayLabel(day)}</div>` +
            byDate.get(day).map(trip => renderRow(db, trip)).join('')
        ).join('');
    }

    function renderSummary(db, trips) {
        const summaryEl = document.getElementById('journal-summary');
        if (trips.length === 0) {
            summaryEl.textContent = '';
            return;
        }

        const tripIds = new Set(trips.map(t => t.id));
        const spent = db.expenses
            .filter(e => tripIds.has(e.related_trip_id))
            .reduce((s, e) => s + e.price, 0);
        const passTrips = trips.filter(t => t.pass_id).length;

        summaryEl.innerHTML = `
            <span><strong>${trips.length}</strong> ${plural(trips.length, 'поездка', 'поездки', 'поездок')}
                ${passTrips ? `<span class="journal-summary-pass">· ${passTrips} по проездному</span>` : ''}
            </span>
            <strong>${formatMoney(spent)}</strong>`;
    }

    function renderRow(db, trip) {
        const expense = db.expenses.find(e => e.related_trip_id === trip.id);
        const pass = trip.pass_id ? db.passes.find(p => p.id === trip.pass_id) : null;
        const transportLabel = TRANSPORT_LABELS[trip.transport] || trip.transport;

        let paymentLabel = '';
        let priceStr = '';
        if (pass) {
            paymentLabel = 'Проездной';
            priceStr = '—';
        } else if (expense) {
            paymentLabel = expense.payment === 'cash' ? 'Наличные' : 'Предоплата';
            priceStr = formatMoney(expense.price);
        }

        return `<div class="journal-row">
            <span class="journal-time">${formatTime(trip.ts)}</span>
            <span class="journal-transport">${transportLabel}</span>
            <span class="journal-payment">${paymentLabel}</span>
            <span class="journal-price">${priceStr}</span>
        </div>`;
    }

    init();
})();
