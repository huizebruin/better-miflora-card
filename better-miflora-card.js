/* Enhanced better-miflora-card with threshold alerts and battery icons */
class BetterMifloraCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._initialized = false;

    this.sensors = {
      moisture: 'mdi:water',
      temperature: 'mdi:thermometer',
      illuminance: 'mdi:white-balance-sunny',
      conductivity: 'mdi:emoticon-poop',
      battery: 'mdi:battery',
      humidity: 'mdi:water-percent'
    };

    // Wait for ha-icon to be available
    if (customElements.get('ha-icon')) {
      this._initialized = true;
    } else {
      customElements.whenDefined('ha-icon').then(() => {
        this._initialized = true;
        if (this._hass && this.config) {
          this._render();
        }
      });
    }
  }

  _computeIcon(sensor, state) {
    const configured = this.config?.custom_icons?.[sensor];
    const base = configured || this.sensors[sensor] || 'mdi:circle';
    
    if (sensor === 'battery' && typeof state === 'number' && !isNaN(state)) {
      if (state <= 5) {
        return `${base}-alert`;
      } else if (state < 95) {
        return `${base}-${Math.round((state / 10) - 0.01) * 10}`;
      }
    }
    return base;
  }

  _click(entity) {
    this._fire('hass-more-info', { entityId: entity });
  }

  _fire(type, detail) {
    const event = new Event(type, { bubbles: true, cancelable: false, composed: true });
    event.detail = detail || {};
    this.dispatchEvent(event);
    return event;
  }

  _safeNumber(v) {
    if (v === undefined || v === null) return null;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }

  _formatDate(iso) {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      const now = new Date();
      const diff = now - d;
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      
      if (minutes < 1) return 'Just now';
      if (minutes < 60) return `${minutes}m ago`;
      if (hours < 24) return `${hours}h ago`;
      if (days < 7) return `${days}d ago`;
      return d.toLocaleDateString();
    } catch (e) { 
      return iso; 
    }
  }

  _createIcon(iconName, color = null) {
    const haIcon = document.createElement('ha-icon');
    haIcon.setAttribute('icon', iconName);
    
    // Apply inline styles for maximum compatibility
    const styles = {
      '--mdc-icon-size': '24px',
      'width': '24px',
      'height': '24px',
      'display': 'inline-flex',
      'align-items': 'center',
      'justify-content': 'center',
      'color': color || 'var(--paper-item-icon-color, currentColor)'
    };
    
    Object.assign(haIcon.style, styles);
    
    // Ensure icon property is set (some HA versions need this)
    requestAnimationFrame(() => {
      if (!haIcon.icon) haIcon.icon = iconName;
    });
    
    return haIcon;
  }

  _getAlertInfo(type, stateNum, config) {
    const maxMoisture = this._safeNumber(config.max_moisture);
    const minMoisture = this._safeNumber(config.min_moisture);
    const minConductivity = this._safeNumber(config.min_conductivity);
    const minTemperature = this._safeNumber(config.min_termperature);
    
    let alertStyle = '';
    let alertIcon = '';
    let rangeInfo = '';
    
    if (type === 'moisture') {
      if (maxMoisture !== null && stateNum > maxMoisture) {
        alertStyle = 'color: var(--error-color, red); font-weight: 600;';
        alertIcon = '▲ ';
      } else if (minMoisture !== null && stateNum < minMoisture) {
        alertStyle = 'color: var(--error-color, red); font-weight: 600;';
        alertIcon = '▼ ';
      }
      
      if (minMoisture !== null && maxMoisture !== null) {
        rangeInfo = ` (${minMoisture}% - ${maxMoisture}%)`;
      }
    }
    
    if (type === 'conductivity' && minConductivity !== null && stateNum < minConductivity) {
      alertStyle = 'color: var(--error-color, red); font-weight: 600;';
      alertIcon = '▼ ';
    }
    
    if (type === 'temperature' && minTemperature !== null && stateNum < minTemperature) {
      alertStyle = 'color: var(--error-color, red); font-weight: 600;';
      alertIcon = '▼ ';
    }
    
    return { alertStyle, alertIcon, rangeInfo };
  }

  _render() {
    if (!this._initialized || !this.config || !this._hass) return;

    const config = this.config;
    const hass = this._hass;

    const sensorsDiv = this.shadowRoot.getElementById('sensors');
    if (!sensorsDiv) return;
    
    sensorsDiv.innerHTML = '';

    for (let i = 0; i < config.entities.length; i++) {
      const entry = config.entities[i];
      const type = entry.type;
      const entity = entry.entity;
      const entityState = hass.states[entity];
      
      // Display name
      const displayName = entry.name || (type ? (type[0].toUpperCase() + type.slice(1)) : 'Unknown');
      
      // Get state
      let rawState = entityState?.state || null;
      const stateNum = this._safeNumber(rawState);
      const uom = entityState?.attributes?.unit_of_measurement || '';
      
      let displayState;
      if (stateNum === null) {
        displayState = rawState || 'unavailable';
      } else {
        displayState = `${stateNum}${uom}`;
      }

      // Get icon
      const icon = this._computeIcon(type, stateNum);

      // Get alert info based on thresholds
      const { alertStyle, alertIcon, rangeInfo } = this._getAlertInfo(type, stateNum, config);

      // Build sensor element
      const sensorEl = document.createElement('div');
      sensorEl.className = 'sensor';
      sensorEl.id = `sensor${i}`;
      sensorEl.setAttribute('role', 'button');
      sensorEl.setAttribute('tabindex', '0');
      sensorEl.addEventListener('click', () => this._click(entity));
      sensorEl.addEventListener('keypress', (e) => { 
        if (e.key === 'Enter' || e.key === ' ') { 
          e.preventDefault(); 
          this._click(entity); 
        }
      });
      sensorEl.title = `${displayName}: ${displayState}`;

      // Icon
      const iconWrap = document.createElement('div');
      iconWrap.className = 'icon';
      const haIcon = this._createIcon(icon);
      iconWrap.appendChild(haIcon);

      // Name with range info
      const nameWrap = document.createElement('div');
      nameWrap.className = 'name';
      nameWrap.textContent = `${displayName}${rangeInfo}`;

      // State with alert styling
      const stateWrap = document.createElement('div');
      stateWrap.className = 'state';
      if (alertStyle) {
        stateWrap.style.cssText = alertStyle;
      }
      stateWrap.innerHTML = `${alertIcon}${displayState}`;

      sensorEl.appendChild(iconWrap);
      sensorEl.appendChild(nameWrap);
      sensorEl.appendChild(stateWrap);

      // Last changed (if enabled)
      const compact = Boolean(config.compact);
      if (!compact && config.show_last_changed) {
        const lastChangedRaw = entityState?.last_changed;
        if (lastChangedRaw) {
          const secondary = document.createElement('div');
          secondary.className = 'secondary';
          secondary.textContent = `Updated ${this._formatDate(lastChangedRaw)}`;
          sensorEl.appendChild(secondary);
        }
      }

      sensorsDiv.appendChild(sensorEl);
    }
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  setConfig(config) {
    if (!config.entities) {
      throw new Error('Please define an entity');
    }

    this.config = config;

    const root = this.shadowRoot;
    root.innerHTML = '';

    const card = document.createElement('ha-card');
    const content = document.createElement('div');
    const style = document.createElement('style');

    style.textContent = `
      ha-card { 
        position: relative; 
        padding: 16px; 
        background-size: cover;
        background-position: center;
      }
      
      .image { 
        float: right; 
        margin-left: 15px; 
        margin-right: 0; 
        margin-bottom: 15px; 
        width: 125px; 
        height: 125px; 
        border-radius: 8px; 
        object-fit: cover;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      }
      
      .sensor { 
        display: flex; 
        align-items: center;
        cursor: pointer; 
        padding: 12px 8px; 
        border-bottom: 1px solid var(--divider-color, rgba(0,0,0,0.06));
        transition: background-color 0.2s ease;
        flex-wrap: wrap;
      }
      
      .sensor:hover {
        background-color: var(--secondary-background-color, rgba(0,0,0,0.02));
        border-radius: 8px;
      }
      
      .sensor:last-child {
        border-bottom: none;
      }
      
      .icon { 
        margin-right: 12px;
        color: var(--paper-item-icon-color, #44739e);
        width: 24px;
        height: 24px;
        flex: 0 0 24px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      /* Critical: Force ha-icon visibility */
      ha-icon {
        display: inline-flex !important;
        width: 24px !important;
        height: 24px !important;
        min-width: 24px !important;
        min-height: 24px !important;
        --mdc-icon-size: 24px !important;
      }
      
      .icon ha-icon {
        color: inherit;
      }
      
      .name { 
        flex: 1;
        font-weight: 500;
        color: var(--primary-text-color);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-top: 3px;
      }
      
      .state { 
        margin-left: auto;
        font-weight: 500;
        color: var(--secondary-text-color);
        white-space: nowrap;
        margin-top: 3px;
      }
      
      .secondary { 
        width: 100%;
        margin-top: 6px;
        margin-left: 36px;
        font-size: 0.75rem;
        color: var(--secondary-text-color, #888);
        opacity: 0.8;
      }
      
      .clearfix::after { 
        content: "";
        clear: both;
        display: table;
      }

      #container {
        position: relative;
      }

      #sensors {
        display: flex;
        flex-direction: column;
      }
      
      .content {
        clear: both;
      }
    `;

    // Add image if configured
    if (this.config.image) {
      const plantimage = document.createElement('img');
      plantimage.className = 'image';
      plantimage.src = `/local/${this.config.image}`;
      plantimage.alt = this.config.title || 'Plant image';
      plantimage.loading = 'lazy';
      card.appendChild(plantimage);
    }

    content.id = 'container';
    content.className = 'content clearfix';
    
    const sensorsDiv = document.createElement('div');
    sensorsDiv.id = 'sensors';
    content.appendChild(sensorsDiv);

    card.header = config.title || '';
    card.appendChild(content);
    card.appendChild(style);
    root.appendChild(card);

    // Trigger initial render if hass is available
    if (this._hass) {
      this._render();
    }
  }

  getCardSize() { 
    return 2;
  }
}

customElements.define('better-miflora-card', BetterMifloraCard);
