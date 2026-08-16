"use client";

import type { PlayerSettings } from "@/hooks/usePlayerSettings";

type SettingsPanelProps = {
  open: boolean;
  settings: PlayerSettings;
  onChange: <K extends keyof PlayerSettings>(
    key: K,
    value: PlayerSettings[K],
  ) => void;
  onClose: () => void;
};

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="settings-row">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        tabIndex={-1}
        onMouseDown={(event) => event.preventDefault()}
        className={`settings-switch ${checked ? "settings-switch--on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className="settings-switch__knob" />
      </button>
    </label>
  );
}

function SliderRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="settings-slider-row">
      <div className="settings-row__head">
        <span>{label}</span>
        <span className="settings-row__value">{Math.round(value * 100)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        tabIndex={-1}
        aria-label={label}
        className="settings-slider"
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function ChoiceRow<T extends string>({
  label,
  value,
  options,
  onChange,
  columns = 2,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  columns?: 2 | 3;
}) {
  return (
    <div className="settings-choice-row">
      <span className="settings-choice-row__label">{label}</span>
      <div
        className={`settings-choice ${columns === 3 ? "settings-choice--triple" : ""}`}
        role="group"
        aria-label={label}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            className={`settings-choice__option ${
              value === option.value ? "settings-choice__option--active" : ""
            }`}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SettingsPanel({
  open,
  settings,
  onChange,
  onClose,
}: SettingsPanelProps) {
  return (
    <div
      className={`settings-layer ${open ? "settings-layer--open" : ""}`}
      aria-hidden={!open}
    >
      <button
        type="button"
        tabIndex={-1}
        className="settings-layer__scrim"
        aria-label="Close settings"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClose}
      />
      <aside className="settings-panel" aria-label="Settings">
        <div className="settings-panel__frame" aria-hidden="true" />
        <div className="settings-panel__inner">
          <h2 className="settings-panel__title">Settings</h2>
          <div className="settings-ornament" aria-hidden="true">
            <span />
            <i />
            <span />
          </div>

          <section className="settings-section">
            <h3 className="settings-section__title">UI</h3>
            <ChoiceRow
              label="Show vinyl"
              value={settings.vinylDisplay}
              columns={3}
              options={[
                { value: "off", label: "No" },
                { value: "left", label: "Left" },
                { value: "right", label: "Right" },
              ]}
              onChange={(value) => onChange("vinylDisplay", value)}
            />
            <ToggleRow
              label="Autohide juke list"
              checked={settings.autohideJuke}
              onChange={(value) => onChange("autohideJuke", value)}
            />
            <ToggleRow
              label="Show Jazz Jukebox title"
              checked={settings.showBrand}
              onChange={(value) => onChange("showBrand", value)}
            />
          </section>

          <section className="settings-section">
            <h3 className="settings-section__title">Music</h3>
            <SliderRow
              label="Static"
              value={settings.staticLevel}
              onChange={(value) => onChange("staticLevel", value)}
            />
            <SliderRow
              label="Volume"
              value={settings.volume}
              onChange={(value) => onChange("volume", value)}
            />
          </section>

          <p className="settings-panel__hint">esc</p>
        </div>
      </aside>
    </div>
  );
}
