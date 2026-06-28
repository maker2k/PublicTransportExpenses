(function() {
    const STORAGE_KEY = 'transit_diary';
    const THEME_KEY = 'transit_theme';

    const els = {
        priceGroundPrepaid: document.getElementById('price-ground-prepaid'),
        priceGroundCash: document.getElementById('price-ground-cash'),
        priceMetro: document.getElementById('price-metro'),
        btnSavePrices: document.getElementById('btn-save-prices'),
        btnSaveTransports: document.getElementById('btn-save-transports'),
        btnReset: document.getElementById('btn-reset'),
    };

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

    function init() {
        initTheme();
        loadPrices();
        loadTransports();
        els.btnSavePrices.addEventListener('click', savePrices);
        els.btnSaveTransports.addEventListener('click', saveTransports);
        els.btnReset.addEventListener('click', resetAll);
        document.querySelectorAll('#optional-transports .transport-btn').forEach(btn => {
            btn.addEventListener('click', () => btn.classList.toggle('selected'));
        });
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

    function loadPrices() {
        const db = loadData();
        const prices = db.prices || { ground: { prepaid: 1.10, cash: 1.15 }, metro: { fixed: 1.15 } };
        els.priceGroundPrepaid.value = prices.ground?.prepaid || 1.10;
        els.priceGroundCash.value = prices.ground?.cash || 1.15;
        els.priceMetro.value = prices.metro?.fixed || 1.15;
    }

    function savePrices() {
        const db = loadData();
        db.prices = {
            ground: {
                prepaid: parseFloat(els.priceGroundPrepaid.value) || 1.10,
                cash: parseFloat(els.priceGroundCash.value) || 1.15
            },
            metro: {
                fixed: parseFloat(els.priceMetro.value) || 1.15
            }
        };
        saveData(db);
        alert('Цены сохранены');
    }

    function loadTransports() {
        const db = loadData();
        const enabled = db.defaults?.enabledTransports || [];
        document.querySelectorAll('#optional-transports .transport-btn').forEach(btn => {
            btn.classList.toggle('selected', enabled.includes(btn.dataset.transport));
        });
    }

    function saveTransports() {
        const db = loadData();
        const enabled = Array.from(document.querySelectorAll('#optional-transports .transport-btn.selected'))
            .map(btn => btn.dataset.transport);
        if (!db.defaults) db.defaults = {};
        db.defaults.enabledTransports = enabled;
        saveData(db);
        alert('Кнопки сохранены');
    }

    function resetAll() {
        if (!confirm('Удалить ВСЕ поездки и проездные? Это действие необратимо.')) return;
        if (!confirm('Точно сбросить?')) return;
        const db = loadData();
        db.passes = [];
        db.pass_transport = [];
        db.trips = [];
        db.expenses = [];
        saveData(db);
        alert('Все данные удалены');
    }

    init();
})();
