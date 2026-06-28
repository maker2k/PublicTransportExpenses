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

    function loadData() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return { passes: [], pass_transport: [], trips: [], expenses: [], defaults: { enabledTransports: [] } };
            return JSON.parse(raw);
        } catch {
            return { passes: [], pass_transport: [], trips: [], expenses: [], defaults: { enabledTransports: [] } };
        }
    }

    function today() {
        const d = new Date();
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }

    function formatTime(isoStr) {
        const d = new Date(isoStr);
        return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }

    function formatMoney(amount) {
        return amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' BYN';
    }

    function formatDateFull(dateStr) {
        const d = new Date(dateStr);
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
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
    }

    function undoLast() {
        if (!confirm('Отменить последнюю поездку?')) return;
        const db = loadData();
        const t = today();

        const lastTodayIdx = db.trips.findLastIndex(tr => tr.ts.startsWith(t));
        if (lastTodayIdx < 0) return;

        const lastTrip = db.trips[lastTodayIdx];
        db.trips.splice(lastTodayIdx, 1);

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
        const t = today();

        document.getElementById('journal-date').textContent = formatDateFull(t);

        const todayTrips = db.trips
            .filter(tr => tr.ts.startsWith(t))
            .sort((a, b) => b.ts.localeCompare(a.ts));

        const emptyEl = document.getElementById('journal-empty');
        const listEl = document.getElementById('journal-list');

        if (todayTrips.length === 0) {
            emptyEl.classList.remove('hidden');
            listEl.classList.add('hidden');
            return;
        }

        emptyEl.classList.add('hidden');
        listEl.classList.remove('hidden');

        listEl.innerHTML = todayTrips.map(trip => {
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
        }).join('');

        document.getElementById('btn-undo').classList.toggle('hidden', todayTrips.length === 0);
    }

    init();
})();
