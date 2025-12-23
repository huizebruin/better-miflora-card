class BetterMifloraCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        // Use mdi: icons which Home Assistant expects
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

        // Battery: choose alert or tiered icons
        if (sensor === 'battery' && typeof state === 'number' && !isNaN(state)) {
            if (state <= 5) {
                return `${icon}-alert`;
            } else {
                // Round to nearest 10 and clamp between 0 and 100
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
        // Dispatch from the custom element so HA receives it correctly
        this.dispatchEvent(event);
        return event;
    }

    // Helpers
    _safeNumber(v) {
        if (v === undefined || v === null) return null;
        const n = parseFloat(v);
        return (Number.isFinite(n) ? n : null);
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

    // compute progress fill percent and gradient & label color based on configured range
    _computeProgress(stateNum, entityMin, entityMax, globalMin, globalMax, colors) {
        const min = (typeof entityMin === 'number') ? entityMin : ((typeof globalMin === 'number') ? globalMin : null);
        const max = (typeof entityMax === 'number') ? entityMax : ((typeof globalMax === 'number') ? globalMax : null);

        if (stateNum === null || stateNum === undefined || typeof stateNum !== 'number' || isNaN(stateNum)) {
            const fallbackColor = (colors && colors.in_range) ? colors.in_range : 'var(--disabled-text-color, #bbb)';
            return { percent: 0, gradient: `linear-gradient(90deg, ${fallbackColor} 0%, ${fallbackColor} 100%)`, labelColor: fallbackColor };
        }

        const percent = this._clamp(Math.round(stateNum), 0, 100);
        const inRangeColor = (colors && colors.in_range) ? colors.in_range : 'var(--paper-item-icon-active-color, #8bc34a)';
        const belowColor = (colors && colors.below) ? colors.below : 'var(--error-color, #d32f2f)';
        const aboveColor = (colors && colors.above) ? colors.above : 'var(--accent-color, #ff9800)';

        let labelColor = inRangeColor;
        if (min !== null && stateNum < min) {
            labelColor = belowColor;
        } else if (max !== null && stateNum > max) {
            labelColor = aboveColor;
        } else {
            labelColor = inRangeColor;
        }

        let minPos = (min !== null) ? this._clamp(min, 0, 100) : 0;
        let maxPos = (max !== null) ? this._clamp(max, 0, 100) : 100;
        if (minPos > maxPos) {
            const tmp = minPos; minPos = maxPos; maxPos = tmp;
        }

        const overlap = 1;
        const stopA = this._clamp(minPos - overlap, 0, 100);
        const stopB = this._clamp(minPos + overlap, 0, 100);
        const stopC = this._clamp(maxPos - overlap, 0, 100);
        const stopD = this._clamp(maxPos + overlap, 0, 100);

        let gradient;
        if (min !== null && max !== null && minPos === maxPos) {
            gradient = `linear-gradient(90deg, ${belowColor} 0%, ${belowColor} ${minPos}%, ${inRangeColor} ${minPos}%, ${inRangeColor} ${minPos}%, ${aboveColor} ${minPos}%, ${aboveColor} 100%)`;
        } else {
            gradient = `linear-gradient(90deg, ${belowColor} 0%, ${belowColor} ${stopA}%, ${inRangeColor} ${stopB}%, ${inRangeColor} ${stopC}%, ${aboveColor} ${stopD}%, ${aboveColor} 100%)`;
        }

        return { percent, gradient, labelColor };
    }

    // Home Assistant will set the hass property when the state of Home Assistant changes.
    set hass(hass) {
        if (!this.config) return;
        const config = this.config;

        const _globalMaxMoisture = this._safeNumber(config.max_moisture);
        const _globalMinMoisture = this._safeNumber(config.min_moisture);
        const _minConductivity = this._safeNumber(config.min_conductivity);
        const _minTemperature = this._safeNumber(config.min_temperature);

        const globalColorConfig = {
            in_range: config.color_in_range || null,
            below: config.color_below || null,
            above: config.color_above || null
        };

        const container = this.shadowRoot.getElementById('container');
        if (!container) return;

        const sensorsDiv = this.shadowRoot.getElementById('sensors');
        sensorsDiv.innerHTML = '';

        for (let i = 0; i < config.entities.length; i++) {
            const entry = config.entities[i];
            const _name = entry['type'];
            const _sensor = entry['entity'];

            const _display_name = entry['name'] ?
                entry['name'] :
                (_name ? (_name[0].toUpperCase() + _name.slice(1)) : 'Unknown');

            let rawState = hass.states[_sensor] ? hass.states[_sensor].state : null;
            let _stateNum = this._safeNumber(rawState);

            let _uom = (hass.states[_sensor] && hass.states[_sensor].attributes) ?
                (hass.states[_sensor].attributes.unit_of_measurement || '') : '';

            let displayState;
            if (_stateNum === null) {
                displayState = rawState || 'unavailable';
            } else {
                if (_uom === '%') {
                    displayState = `${_stateNum} ${_uom}`;
                } else if (_uom) {
                    displayState = `${_stateNum}${_uom}`;
                } else {
                    displayState = `${_stateNum}`;
                }
            }

            let _icon = this._computeIcon(_name, _stateNum);
            if (config.custom_icons && config.custom_icons[_name]) {
                _icon = config.custom_icons[_name];
            }

            let _alertStyle = '';
            let _alertIcon = '';
            let moistureInfo = '';

            const entityMin = (typeof entry.min_moisture === 'number') ? entry.min_moisture : null;
            const entityMax = (typeof entry.max_moisture === 'number') ? entry.max_moisture : null;

            const entryColors = {
                in_range: entry.color_in_range || null,
                below: entry.color_below || null,
                above: entry.color_above || null
            };

            if (_name === 'moisture' && _stateNum !== null) {
                const effectiveMin = (entityMin !== null) ? entityMin : _globalMinMoisture;
                const effectiveMax = (entityMax !== null) ? entityMax : _globalMaxMoisture;

                if (effectiveMax !== null && _stateNum > effectiveMax) {
                    _alertStyle = 'color:var(--error-color, red);';
                    _alertIcon = '▲ ';
                } else if (effectiveMin !== null && _stateNum < effectiveMin) {
                    _alertStyle = 'color:var(--error-color, red);';
                    _alertIcon = '▼ ';
                    if (!config.custom_icons || !config.custom_icons.moisture) {
                        _icon = 'mdi:water-off';
                    }
                }

                if ((entityMin !== null && entityMax !== null) || (_globalMinMoisture !== null && _globalMaxMoisture !== null)) {
                    const showMin = (entityMin !== null) ? entityMin : _globalMinMoisture;
                    const showMax = (entityMax !== null) ? entityMax : _globalMaxMoisture;
                    if (showMin !== null && showMax !== null) {
                        moistureInfo = ` (${showMin}% - ${showMax}%)`;
                    }
                }
            }

            if (_name === 'conductivity' && _stateNum !== null && _minConductivity !== null) {
                if (_stateNum < _minConductivity) {
                    _alertStyle = 'color:var(--error-color, red);';
                    _alertIcon = '▼ ';
                }
            }

            if (_name === 'temperature' && _stateNum !== null && _minTemperature !== null) {
                if (_stateNum < _minTemperature) {
                    _alertStyle = 'color:var(--error-color, red);';
                    _alertIcon = '▼ ';
                }
            }

            // Build sensor element
            const sensorEl = document.createElement('div');
            sensorEl.className = 'sensor';
            sensorEl.id = `sensor${i}`;
            sensorEl.setAttribute('role', 'button');
            sensorEl.setAttribute('tabindex', '0');
            sensorEl.addEventListener('click', () => this._click(_sensor));
            sensorEl.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this._click(_sensor);
                }
            });

            sensorEl.title = `${_display_name}: ${displayState}`;

            const sensorRow = document.createElement('div');
            sensorRow.className = 'sensor-row';

            const iconWrap = document.createElement('div');
            iconWrap.className = 'icon';
            const haIcon = document.createElement('ha-icon');
            haIcon.setAttribute('icon', _icon);
            iconWrap.appendChild(haIcon);

            const nameWrap = document.createElement('div');
            nameWrap.className = 'name';
            nameWrap.textContent = `${_display_name}${moistureInfo}`;

            const compactGlobal = Boolean(config.compact);
            const compactEntity = Boolean(entry.compact);
            const compact = compactEntity || compactGlobal;

            const stateWrap = document.createElement('div');
            stateWrap.className = 'state';
            stateWrap.style = _alertStyle;
            stateWrap.innerHTML = `${_alertIcon}${displayState}`;

            sensorRow.appendChild(iconWrap);
            sensorRow.appendChild(nameWrap);
            if (!compact) {
                sensorRow.appendChild(stateWrap);
            }

            sensorEl.appendChild(sensorRow);

            // Progress bar for moisture sensors
            if (_name === 'moisture') {
                const mergedColors = {
                    in_range: entryColors.in_range || globalColorConfig.in_range || null,
                    below: entryColors.below || globalColorConfig.below || null,
                    above: entryColors.above || globalColorConfig.above || null
                };

                const { percent, gradient, labelColor } = this._computeProgress(_stateNum, entityMin, entityMax, _globalMinMoisture, _globalMaxMoisture, mergedColors);

                const progressWrap = document.createElement('div');
                progressWrap.className = compact ? 'progress-wrap compact' : 'progress-wrap';

                const progressBar = document.createElement('div');
                progressBar.className = 'progress';

                const progressFill = document.createElement('div');
                progressFill.className = 'progress-fill';
                progressFill.style.width = `${percent}%`;
                progressFill.style.background = gradient;
                progressFill.setAttribute('aria-valuenow', percent);
                progressFill.setAttribute('aria-valuemin', 0);
                progressFill.setAttribute('aria-valuemax', 100);
                progressFill.setAttribute('role', 'progressbar');
                progressBar.appendChild(progressFill);

                const progressLabel = document.createElement('div');
                progressLabel.className = 'progress-label';
                progressLabel.textContent = (typeof _stateNum === 'number' && !isNaN(_stateNum)) ? (compact ? `${_stateNum}${_uom ? ' ' + _uom : ''}` : `${_stateNum} ${_uom || '%'}`) : '—';
                progressLabel.style.color = labelColor;

                progressWrap.appendChild(progressBar);
                progressWrap.appendChild(progressLabel);

                sensorEl.appendChild(progressWrap);
            }

            if (!compact && config.show_last_changed) {
                const lastChangedRaw = hass.states[_sensor] ? hass.states[_sensor].last_changed : null;
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

    // Home Assistant will call setConfig(config) when the configuration changes.
    setConfig(config) {
        if (!config.entities || !Array.isArray(config.entities) || config.entities.length === 0) {
            throw new Error('Please define one or more entities in the entities array');
        }

        // Remove previous root child (if any)
        const root = this.shadowRoot;
        if (root.lastChild) root.removeChild(root.lastChild);

        this.config = config;

        // container elements
        const card = document.createElement('ha-card');
        const content = document.createElement('div');
        const style = document.createElement('style');

        style.textContent = `
            ha-card {
                position: relative;
                padding: 0.5rem;
                background-size: 100%;
            }
            ha-card .header {
                width: 100%;
            }

            /* Main content: text on the left, image on the right */
            .content {
                display: flex;
                align-items: flex-start;
                gap: 12px;
            }
            .info {
                flex: 1 1 auto;
                min-width: 0; /* allow ellipsis on .name */
            }
            .image-wrapper {
                flex: 0 0 125px;
                display: flex;
                align-items: flex-start;
                justify-content: center;
            }
            .image {
                width: 125px;
                height: 125px;
                border-radius: 6px;
                object-fit: cover;
                margin: 0;
            }

            /* Mobile: stack vertically with image above text */
            @media (max-width: 600px) {
                .content {
                    flex-direction: column;
                    align-items: center;
                }
                .image-wrapper {
                    width: 100%;
                }
                .image {
                    margin: 0 auto 12px auto;
                }
                .info {
                    width: 100%;
                }
            }

            .sensor {
                display: block;
                cursor: pointer;
                padding-bottom: 10px;
                margin-bottom: 6px;
            }
            .sensor-row {
                display: flex;
                width: 100%;
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
                max-width: 220px;
            }
            .state {
                white-space: nowrap;
                overflow: hidden;
                margin-top: 3px;
                margin-left: auto;
            }
            .uom {
                color: var(--secondary-text-color);
            }
            .secondary {
                margin-left: 8px;
            }
            .progress-wrap {
                display: flex;
                align-items: center;
                gap: 6px;
                margin-top: 6px;
            }
            .progress {
                background: rgba(0,0,0,0.06);
                border-radius: 6px;
                height: 6px;
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
            .clearfix::after {
                content: "";
                clear: both;
                display: table;
            }

            /* compact tweaks */
            :host([compact]) .name {
                max-width: 200px;
            }
        `;

        // Build the content with an info column (sensors) on the left and the image on the right
        const imageHtml = this.config.image ? `<img class="image" src="/local/${this.config.image}" alt="${this.config.title || 'plant image'}">` : '';
        content.id = "container";
        content.innerHTML = `
            <div class="content clearfix">
                <div class="info">
                    <div id="sensors"></div>
                </div>
                <div class="image-wrapper">
                    ${imageHtml}
                </div>
            </div>
        `;

        card.header = config.title || '';
        card.appendChild(content);
        card.appendChild(style);
        root.appendChild(card);
    }

    getCardSize() {
        return 2;
    }
}

customElements.define('better-miflora-card', BetterMifloraCard);
