/* Enhanced better-miflora-card with improved icon rendering and reliability */
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
      humidity: 'mdi:water-percent',
      dry: 'mdi:water-off'
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
    const base = configured || this.sensors[sensor] || '';
    
    if (sensor === 'battery' && typeof state === 'number' && !isNaN(state)) {
      if (state <= 5) return `${base}-alert`;
      const tier = Math.min(100, Math.max(0, Math.round(state / 10) * 10));
      return `${base}-${tier}`;
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

  _clamp(v, a, b) { 
    return Math.max(a, Math.min(b, v)); 
  }

  _computeProgress(stateNum, entityMin, entityMax, globalMin, globalMax, colors) {
    const min = this._safeNumber(entityMin) ?? this._safeNumber(globalMin);
    const max = this._safeNumber(entityMax) ?? this._safeNumber(globalMax);

    if (stateNum === null || stateNum === undefined || typeof stateNum !== 'number' || isNaN(stateNum)) {
      const fallback = colors?.in_range || 'var(--disabled-text-color, #bbb)';
      return { 
        percent: 0, 
        gradient: `linear-gradient(90deg, ${fallback} 0%, ${fallback} 100%)`, 
        labelColor: fallback 
      };
    }

    const percent = this._clamp(Math.round(stateNum), 0, 100);
    const inRangeColor = colors?.in_range || 'var(--paper-item-icon-active-color, #8bc34a)';
    const belowColor = colors?.below || 'var(--error-color, #d32f2f)';
    const aboveColor = colors?.above || 'var(--accent-color, #ff9800)';
    
    let labelColor = inRangeColor;
    if (min !== null && stateNum < min) labelColor = belowColor;
    else if (max !== null && stateNum > max) labelColor = aboveColor;

    let minPos = (min !== null) ? this._clamp(min, 0, 100) : 0;
    let maxPos = (max !== null) ? this._clamp(max, 0, 100) : 100;
    if (minPos > maxPos) [minPos, maxPos] = [maxPos, minPos];

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

  _createIcon(iconName, color = null) {
    const haIcon = document.createElement('ha-icon');
    haIcon.setAttribute('icon', iconName);
    
    // Apply inline styles for maximum compatibility
    const styles = {
      '--mdc-icon-size': '20px',
      'width': '20px',
      'height': '20px',
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

  _render() {
    if (!this._initialized || !this.config || !this._hass) return;

    const config = this.config;
    const hass = this._hass;
    const globalMin = this._safeNumber(config.min_moisture);
    const globalMax = this._safeNumber(config.max_moisture);
    const globalColors = { 
      in_range: config.color_in_range || null, 
      below: config.color_below || null, 
      above: config.color_above || null 
    };

    const sensorsDiv = this.shadowRoot.getElementById('sensors');
    if (!sensorsDiv) return;
    
    sensorsDiv.innerHTML = '';

    let anyDry = false;

    for (let i = 0; i < config.entities.length; i++) {
      const entry = config.entities[i];
      const type = entry.type;
      const entity = entry.entity;
      const displayName = entry.name || (type ? (type[0].toUpperCase() + type.slice(1)) : 'Unknown');
      const entityState = hass.states[entity];
      const rawState = entityState?.state || null;
      const stateNum = this._safeNumber(rawState);
      const uom = entityState?.attributes?.unit_of_measurement || '';
      
      let displayState = stateNum === null 
        ? (rawState || 'unavailable') 
        : uom === '%' 
          ? `${stateNum} ${uom}` 
          : uom 
            ? `${stateNum}${uom}` 
            : `${stateNum}`;

      // Determine icon
      let icon = this._computeIcon(type, stateNum);
      if ((!icon || icon === '') && type === 'humidity') {
        icon = config.custom_icons?.humidity || this.sensors.humidity;
      }
      if (!icon) {
        icon = 'mdi:circle';
        console.warn(`better-miflora-card: Missing icon for type "${type}" on entity "${entity}". Using fallback.`);
      }

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

      // Sensor row
      const sensorRow = document.createElement('div');
      sensorRow.className = 'sensor-row';

      // Icon
      const iconWrap = document.createElement('div');
      iconWrap.className = 'icon';
      const haIcon = this._createIcon(icon);
      iconWrap.appendChild(haIcon);

      // Name
      const nameWrap = document.createElement('div');
      nameWrap.className = 'name';
      nameWrap.textContent = displayName;

      // State (if not compact)
      const compactGlobal = Boolean(config.compact);
      const compactEntity = Boolean(entry.compact);
      const compact = compactEntity || compactGlobal;
      
      if (!compact) {
        const stateWrap = document.createElement('div');
        stateWrap.className = 'state';
        stateWrap.textContent = displayState;
        sensorRow.appendChild(iconWrap);
        sensorRow.appendChild(nameWrap);
        sensorRow.appendChild(stateWrap);
      } else {
        sensorRow.appendChild(iconWrap);
        sensorRow.appendChild(nameWrap);
      }

      sensorEl.appendChild(sensorRow);

      // Check for dry condition (moisture only)
      if (type === 'moisture') {
        const entMin = this._safeNumber(entry.min_moisture);
        if (entMin !== null && stateNum !== null && stateNum < entMin) {
          anyDry = true;
        }
      }

      // Last changed (if enabled)
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

    // Update dry status badge
    const statusEl = this.shadowRoot.getElementById('status');
    if (statusEl) {
      if (anyDry) {
        statusEl.innerHTML = '';
        const dryIcon = config.custom_icons?.dry || this.sensors.dry;
        const iconEl = this._createIcon(dryIcon, '#fff');
        statusEl.appendChild(iconEl);
        
        const textSpan = document.createElement('span');
        textSpan.textContent = 'Dry';
        statusEl.appendChild(textSpan);
        
        statusEl.style.display = 'inline-flex';
      } else {
        statusEl.innerHTML = '';
        statusEl.style.display = 'none';
      }
    }
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  setConfig(config) {
    if (!config.entities || !Array.isArray(config.entities) || config.entities.length === 0) {
      throw new Error('Please define one or more entities in the entities array');
    }

    this.config = config;

    const root = this.shadowRoot;
    root.innerHTML = '';

    const card = document.createElement('ha-card');
    const content = document.createElement('div');
    const style = document.createElement('style');
    const status = document.createElement('div');

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
        flex-direction: column;
        cursor: pointer; 
        padding: 12px 0; 
        border-bottom: 1px solid var(--divider-color, rgba(0,0,0,0.06));
        transition: background-color 0.2s ease;
      }
      
      .sensor:hover {
        background-color: var(--secondary-background-color, rgba(0,0,0,0.02));
        border-radius: 8px;
        padding-left: 8px;
        padding-right: 8px;
      }
      
      .sensor:last-child {
        border-bottom: none;
      }
      
      .sensor-row {
        display: flex;
        align-items: center;
        width: 100%;
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
        width: 20px !important;
        height: 20px !important;
        min-width: 20px !important;
        min-height: 20px !important;
        --mdc-icon-size: 20px !important;
      }
      
      .icon ha-icon {
        color: inherit;
      }
      
      .name { 
        flex: 1;
        font-weight: 500;
        color: var(--primary-text-color);
      }
      
      .state { 
        margin-left: auto;
        font-weight: 500;
        color: var(--secondary-text-color);
        white-space: nowrap;
      }
      
      .secondary { 
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
      
      .status { 
        position: absolute;
        right: 12px;
        top: 12px;
        display: none;
        background: var(--error-color, #d32f2f);
        color: #fff;
        padding: 6px 12px;
        border-radius: 16px;
        font-size: 0.75rem;
        font-weight: 600;
        z-index: 10;
        align-items: center;
        gap: 6px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      }
      
      .status ha-icon {
        color: #fff !important;
        width: 16px !important;
        height: 16px !important;
        --mdc-icon-size: 16px !important;
      }

      #container {
        position: relative;
      }

      #sensors {
        display: flex;
        flex-direction: column;
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

    status.id = 'status';
    status.className = 'status';

    card.header = config.title || '';
    card.appendChild(status);
    card.appendChild(content);
    card.appendChild(style);
    root.appendChild(card);

    // Trigger initial render if hass is available
    if (this._hass) {
      this._render();
    }
  }

  getCardSize() { 
    return this.config?.entities?.length || 2; 
  }
}

customElements.define('better-miflora-card', BetterMifloraCard);
