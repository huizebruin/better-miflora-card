class BetterMifloraCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        // Default icons (can be overridden with config.custom_icons)
        this.sensors = {
            moisture: 'mdi:water',
            temperature: 'mdi:thermometer',
            illuminance: 'mdi:white-balance-sunny',
            conductivity: 'mdi:emoticon-poop',
            battery: 'mdi:battery'
        };
    }

    _computeIcon(sensor, state) {
        const icon = this.sensors[sensor];
        if (sensor === 'battery' && typeof state === 'number' && !isNaN(state)) {
            if (state <= 5) {
                return `${icon}-alert`;
            } else {
                const tier = Math.min(100, Math.max(0, Math.round(state / 10) * 10));
                return `${icon}-${tier}`;
            }
        }
        return icon;
    }

    _click(entity) {
        this._fire('hass-more-info', { entityId: entity });
    }

    _fire(type, detail) {
        const event = new Event(type, {
            bubbles: true,
            cancelable: false,
            composed: true
        });
        event.detail = detail || {};
        // dispatch from element
        this.dispatchEvent(event);
        return event;
    }

    // Helpers
    _safeNumber(v) {
        if (v === undefined || v === null) return null;
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : null;
    }

    _formatDate(iso) {
        try {
            const d = new Date(iso);
            if (Number.isNaN(d.getTime())) return iso;
            return d.toLocaleString();
        } catch (e) {
            return iso;
        }
    }

    _clamp(v, a, b) {
        return Math.max(a, Math.min(b, v));
    }

    // Build a smooth gradient from below -> in-range -> above based on min/max thresholds
    _computeProgress(stateNum, entityMin, entityMax, globalMin, globalMax, colors) {
        const min = (typeof entityMin === 'number') ? entityMin : ((typeof globalMin === 'number') ? globalMin : null);
        const max = (typeof entityMax === 'number') ? entityMax : ((typeof globalMax === 'number') ? globalMax : null);

        if (stateNum === null || stateNum === undefined || typeof stateNum !== 'number' || isNaN(stateNum)) {
            const fallback = (colors && colors.in_range) ? colors.in_range : 'var(--disabled-text-color, #bbb)';
            return { percent: 0, gradient: `linear-gradient(90deg, ${fallback} 0%, ${fallback} 100%)`, labelColor: fallback };
        }

        const percent = this._clamp(Math.round(stateNum), 0, 100);

        const inRangeColor = (colors && colors.in_range) ? colors.in_range : 'var(--paper-item-icon-active-color, #8bc34a)';
        const belowColor = (colors && colors.below) ? colors.below : 'var(--error-color, #d32f2f)';
        const aboveColor = (colors && colors.above) ? colors.above : 'var(--accent-color, #ff9800)';

        let labelColor = inRangeColor;
        if (min !== null && stateNum < min) labelColor = belowColor;
        else if (max !== null && stateNum > max) labelColor = aboveColor;

        let minPos = (min !== null) ? this._clamp(min, 0, 100) : 0;
        let maxPos = (max !== null) ? this._clamp(max, 0, 100) : 100;
        if (minPos > maxPos) { const t = minPos; minPos = maxPos; maxPos = t; }

        const overlap = 1;
        const stopA = this._clamp(minPos - overlap, 0, 100);
        const stopB = this._clamp(minPos + overlap, 0, 100);
        const stopC = this._clamp(maxPos - overlap, 0, 100);
        const stopD = this._clamp(maxPos + overlap, 0, 100);

        let gradient;
        if (min !== null && max !== null && minPos === maxPos) {
            gradient = `linear-gradient(90deg, ${belowColor} 0%, ${belowColor} ${minPos}%, ${inRangeColor} ${minPos}%, ${aboveColor} ${minPos}%, ${aboveColor} 100%)`;
        } else {
            gradient = `linear-gradient(90deg, ${belowColor} 0%, ${belowColor} ${stopA}%, ${inRangeColor} ${stopB}%, ${inRangeColor} ${stopC}%, ${aboveColor} ${stopD}%, ${aboveColor} 100%)`;
        }

        return { percent, gradient, labelColor };
    }

    // Called frequently by Home Assistant (state updates)
    set hass(hass) {
        if (!this.config) return;
        const config = this.config;

        const globalMin = this._safeNumber(config.min_moisture);
        const globalMax = this._safeNumber(config.max_moisture);

        // global color config
        const globalColors = {
            in_range: config.color_in_range || null,
            below: config.color_below || null,
            above: config.color_above || null
        };

        const container = this.shadowRoot.getElementById('container');
        if (!container) return;

        // reset sensors
        const sensorsDiv = this.shadowRoot.getElementById('sensors');
        sensorsDiv.innerHTML = '';

        for (let i = 0; i < config.entities.length; i++) {
            const entry = config.entities[i];
            const type = entry.type;
            const entity = entry.entity;

            const displayName = entry.name ? entry.name : (type ? (type[0].toUpperCase() + type.slice(1)) : 'Unknown');

            const rawState = hass.states[entity] ? hass.states[entity].state : null;
            const stateNum = this._safeNumber(rawState);
            const uom = (hass.states[entity] && hass.states[entity].attributes) ? (hass.states[entity].attributes.unit_of_measurement || '') : '';

            let displayState;
            if (stateNum === null) displayState = rawState || 'unavailable';
            else displayState = (uom === '%') ? `${stateNum} ${uom}` : (uom ? `${stateNum}${uom}` : `${stateNum}`);

            // icon handling (with config override)
            let icon = this._computeIcon(type, stateNum);
            if (config.custom_icons && config.custom_icons[type]) icon = config.custom_icons[type];

            let alertStyle = '';
            let alertIcon = '';
            let moistureInfo = '';

            // per-entity min/max
            const entMin = (typeof entry.min_moisture === 'number') ? entry.min_moisture : null;
            const entMax = (typeof entry.max_moisture === 'number') ? entry.max_moisture : null;

            if (type === 'moisture' && stateNum !== null) {
                const effectiveMin = (entMin !== null) ? entMin : globalMin;
                const effectiveMax = (entMax !== null) ? entMax : globalMax;

                if (effectiveMax !== null && stateNum > effectiveMax) { alertStyle = 'color:var(--error-color, red);'; alertIcon = '▲ '; }
                else if (effectiveMin !== null && stateNum < effectiveMin) { alertStyle = 'color:var(--error-color, red);'; alertIcon = '▼ '; if (!config.custom_icons || !config.custom_icons.moisture) icon = 'mdi:water-off'; }

                if ((entMin !== null && entMax !== null) || (globalMin !== null && globalMax !== null)) {
                    const showMin = (entMin !== null) ? entMin : globalMin;
                    const showMax = (entMax !== null) ? entMax : globalMax;
                    if (showMin !== null && showMax !== null) moistureInfo = ` (${showMin}% - ${showMax}%)`;
                }
            }

            // Build sensor DOM
            const sensorEl = document.createElement('div');
            sensorEl.className = 'sensor';
            sensorEl.id = `sensor${i}`;
            sensorEl.setAttribute('role', 'button');
            sensorEl.setAttribute('tabindex', '0');
            sensorEl.addEventListener('click', () => this._click(entity));
            sensorEl.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._click(entity); }
            });

            sensorEl.title = `${displayName}: ${displayState}`;

            // row: icon / name / state (state hidden in compact)
            const sensorRow = document.createElement('div');
            sensorRow.className = 'sensor-row';

            const iconWrap = document.createElement('div'); iconWrap.className = 'icon';
            const haIcon = document.createElement('ha-icon'); haIcon.setAttribute('icon', icon); iconWrap.appendChild(haIcon);

            const nameWrap = document.createElement('div'); nameWrap.className = 'name'; nameWrap.textContent = `${displayName}${moistureInfo}`;

            const compactGlobal = Boolean(config.compact);
            const compactEntity = Boolean(entry.compact);
            const compact = compactEntity || compactGlobal;

            const stateWrap = document.createElement('div'); stateWrap.className = 'state'; stateWrap.style = alertStyle; stateWrap.innerHTML = `${alertIcon}${displayState}`;

            sensorRow.appendChild(iconWrap);
            sensorRow.appendChild(nameWrap);
            if (!compact) sensorRow.appendChild(stateWrap);

            sensorEl.appendChild(sensorRow);

            // Progress bar for moisture (use min/max from entry or global)
            if (type === 'moisture') {
                const mergedColors = {
                    in_range: entry.color_in_range || globalColors && globalColors.in_range || globalColors && globalColors.in_range || globalColors.in_range || config.color_in_range || null,
                    below: entry.color_below || config.color_below || null,
                    above: entry.color_above || config.color_above || null
                };
                // fallback merge simpler:
                const merged = {
                    in_range: entry.color_in_range || globalColors.in_range || null,
                    below: entry.color_below || globalColors.below || null,
                    above: entry.color_above || globalColors.above || null
                };

                const { percent, gradient, labelColor } = this._computeProgress(stateNum, entMin, entMax, globalMin, globalMax, merged);

                const progressWrap = document.createElement('div'); progressWrap.className = compact ? 'progress-wrap compact' : 'progress-wrap';
                const progressBar = document.createElement('div'); progressBar.className = 'progress';
                const progressFill = document.createElement('div'); progressFill.className = 'progress-fill';
                progressFill.style.width = `${percent}%`;
                progressFill.style.background = gradient;
                progressFill.setAttribute('role', 'progressbar');
                progressFill.setAttribute('aria-valuenow', percent);
                progressFill.setAttribute('aria-valuemin', 0);
                progressFill.setAttribute('aria-valuemax', 100);
                progressBar.appendChild(progressFill);

                const progressLabel = document.createElement('div'); progressLabel.className = 'progress-label';
                progressLabel.textContent = (typeof stateNum === 'number' && !isNaN(stateNum)) ? (compact ? `${stateNum}${uom ? ' ' + uom : ''}` : `${stateNum} ${uom || '%'}`) : '—';
                progressLabel.style.color = labelColor;

                progressWrap.appendChild(progressBar);
                progressWrap.appendChild(progressLabel);
                sensorEl.appendChild(progressWrap);
            }

            // optional last_changed
            if (!compact && config.show_last_changed) {
                const lastChangedRaw = hass.states[entity] ? hass.states[entity].last_changed : null;
                if (lastChangedRaw) {
                    const secondary = document.createElement('div');
                    secondary.className = 'secondary';
                    secondary.textContent = `Last: ${this._formatDate(lastChangedRaw)}`;
                    secondary.style = 'font-size: 0.75rem; color: var(--secondary-text-color); margin-left: 10px;';
                    sensorEl.appendChild(secondary);
                }
            }

            sensorsDiv.appendChild(sensorEl);
        }
    }

    // Called rarely; set up the card
    setConfig(config) {
        if (!config.entities || !Array.isArray(config.entities) || config.entities.length === 0) {
            throw new Error('Please define one or more entities in the entities array');
        }

        const root = this.shadowRoot;
        if (root.lastChild) root.removeChild(root.lastChild);

        this.config = config;

        const card = document.createElement('ha-card');
        const content = document.createElement('div');
        const plantimage = document.createElement('div');
        const style = document.createElement('style');

        style.textContent = `
            ha-card {
                position: relative;
                padding: 0.5rem;
                background-size: 100%;
            }
            ha-card .header { width: 100%; }

            /* Image floated right like original layout */
            .image {
                float: right;
                margin-left: 15px;
                margin-right: 15px;
                margin-bottom: 15px;
                width: 125px;
                height: 125px;
                border-radius: 6px;
                object-fit: cover;
            }

            .sensor {
                display: flex;
                cursor: pointer;
                padding-bottom: 10px;
                align-items: center;
            }
            .sensor:focus {
                outline: 2px solid var(--paper-item-icon-active-color, #8bc34a);
                border-radius: 4px;
            }

            .icon {
                margin-left: 10px;
                color: var(--paper-item-icon-color);
                width: 36px;
                flex: 0 0 36px;
            }
            .name {
                margin-top: 3px;
                margin-left: 10px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                max-width: 140px;
            }
            .state {
                white-space: nowrap;
                overflow: hidden;
                margin-top: 3px;
                margin-left: auto;
            }
            .uom { color: var(--secondary-text-color); }

            .progress-wrap {
                display: flex;
                align-items: center;
                gap: 6px;
                margin-left: 10px;
                margin-top: 6px;
            }
            .progress {
                background: rgba(0,0,0,0.06);
                border-radius: 6px;
                height: 6px; /* smaller bar */
                width: calc(100% - 90px);
                overflow: hidden;
                flex: 1 1 auto;
            }
            .progress-fill {
                height: 100%;
                width: 0%;
                border-radius: 4px;
                transition: width 300ms ease, background 300ms ease;
            }
            .progress-label {
                min-width: 48px;
                text-align: right;
                font-size: 0.8rem;
                color: var(--secondary-text-color);
            }

            .secondary { margin-left: 8px; }
            .clearfix::after { content: ""; clear: both; display: table; }
        `;

        plantimage.innerHTML = this.config.image ? `<img class="image" src="/local/${this.config.image}" alt="${this.config.title || 'plant image'}">` : '';

        content.id = "container";
        content.innerHTML = `
            <div class="content clearfix">
                <div id="sensors"></div>
            </div>
        `;

        card.header = config.title || '';
        card.appendChild(plantimage); // float-right image (like original)
        card.appendChild(content);
        card.appendChild(style);
        root.appendChild(card);
    }

    getCardSize() {
        return 2;
    }
}

customElements.define('better-miflora-card', BetterMifloraCard);
