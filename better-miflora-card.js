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
                // Ensure we always return a valid mdi-style name; use explicit -100 for 100
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
            return new Date(iso).toLocaleString();
        } catch (e) {
            return iso;
        }
    }

    // Home Assistant will set the hass property when the state of Home Assistant changes.
    set hass(hass) {
        if (!this.config) return;
        const config = this.config;

        // prepare thresholds with safe parsing and defaults
        const _maxMoisture = this._safeNumber(config.max_moisture);
        const _minMoisture = this._safeNumber(config.min_moisture);
        const _minConductivity = this._safeNumber(config.min_conductivity);
        const _minTemperature = this._safeNumber(config.min_temperature); // fixed typo

        const container = this.shadowRoot.getElementById('container');
        if (!container) return;

        // reset sensors container
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
                // if state is unavailable/unknown or non-numeric, show the raw state or an indicator
                displayState = rawState || 'unavailable';
            } else {
                // If unit is percent and user prefers a space, add a space before % (common preference)
                if (_uom === '%') {
                    displayState = `${_stateNum} ${_uom}`;
                } else if (_uom) {
                    // keep previous behavior for other units (no trailing space added)
                    displayState = `${_stateNum}${_uom}`;
                } else {
                    displayState = `${_stateNum}`;
                }
            }

            // Choose icon: default computed icon possibly overridden with config, and special dry icon when needed
            let _icon = this._computeIcon(_name, _stateNum);

            // Custom icon overrides from config: config.custom_icons: { moisture: 'mdi:water-off', battery: 'mdi:battery-variant' }
            if (config.custom_icons && config.custom_icons[_name]) {
                _icon = config.custom_icons[_name];
            }

            let _alertStyle = '';
            let _alertIcon = '';
            let moistureInfo = '';

            if (_name === 'moisture' && _stateNum !== null) {
                if (_maxMoisture !== null && _stateNum > _maxMoisture) {
                    _alertStyle = 'color:var(--error-color, red);';
                    _alertIcon = '▲ ';
                } else if (_minMoisture !== null && _stateNum < _minMoisture) {
                    _alertStyle = 'color:var(--error-color, red);';
                    _alertIcon = '▼ ';
                    // Show a clearer "dry" icon if configured or by default
                    if (!config.custom_icons || !config.custom_icons.moisture) {
                        _icon = 'mdi:water-off';
                    }
                }

                if (_minMoisture !== null && _maxMoisture !== null) {
                    moistureInfo = ` (${_minMoisture}% - ${_maxMoisture}%)`;
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

            // Accessibility: show name + state in title
            sensorEl.title = `${_display_name}: ${displayState}`;

            const iconWrap = document.createElement('div');
            iconWrap.className = 'icon';
            const haIcon = document.createElement('ha-icon');
            haIcon.setAttribute('icon', _icon);
            iconWrap.appendChild(haIcon);

            const nameWrap = document.createElement('div');
            nameWrap.className = 'name';
            nameWrap.textContent = `${_display_name}${moistureInfo}`;

            const stateWrap = document.createElement('div');
            stateWrap.className = 'state';
            stateWrap.style = _alertStyle;
            stateWrap.innerHTML = `${_alertIcon}${displayState}`;

            sensorEl.appendChild(iconWrap);
            sensorEl.appendChild(nameWrap);
            sensorEl.appendChild(stateWrap);

            // Optional secondary info (like last changed), controlled by config.show_last_changed (boolean)
            if (config.show_last_changed) {
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
        const plantimage = document.createElement('div');
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
            .uom {
                color: var(--secondary-text-color);
            }
            .secondary {
                margin-left: 8px;
            }
            .clearfix::after {
                content: "";
                clear: both;
                display: table;
            }
        `;

        plantimage.innerHTML = config.image ? `<img class="image" src="/local/${config.image}" alt="${config.title || 'plant image'}">` : '';

        content.id = "container";
        content.innerHTML = `
            <div class="content clearfix">
                <div id="sensors"></div>
            </div>
        `;

        card.header = config.title || '';
        card.appendChild(plantimage);
        card.appendChild(content);
        card.appendChild(style);
        root.appendChild(card);
    }

    getCardSize() {
        return 2;
    }
}

customElements.define('better-miflora-card', BetterMifloraCard);
