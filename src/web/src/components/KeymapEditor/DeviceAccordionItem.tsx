import { useMemo } from "react";
import { Row, Col, Form, Accordion, Dropdown } from "react-bootstrap";
import { useDataContext } from "../../hooks/useDataContext";
import type { Device } from "../../types";
import KeybindRow from "./KeybindRow";

export default function DeviceAccordionItem({
  device,
  eventKey,
}: {
  device: Device;
  eventKey: string;
}) {
  const {
    slotPresets,
    handleSelectKeybindPreset,
    userColor,
    userId,
    handleSelectOutput,
  } = useDataContext();

  const selectedPresetName = useMemo(
    () => slotPresets[device.slot] || "None",
    [device, slotPresets]
  );

  const selectedPresetKeybinds = useMemo(() => {
    if (selectedPresetName === "None") return [];
    return device.keybindPresets[selectedPresetName];
  }, [device.keybindPresets, selectedPresetName]);

  const keybindPresetOptions = useMemo(
    () => ["None", ...Object.keys(device.keybindPresets)],
    [device]
  );

  const sendKeybinds = device.connectedUserIds.includes(userId!);

  return (
    <Accordion.Item eventKey={eventKey}>
      <Accordion.Header>
        <Row className="w-100 align-items-center">
          <Col xs={4} className="fw-semibold">
            Slot {device.slot}: {device.name}
          </Col>
          <Col xs={2} className="text-muted small">
            Type: <span className="fw-normal">Unknown</span>
          </Col>
          <Col xs={3}>
            <Form.Check
              onChange={(event) =>
                handleSelectOutput(device.id, event.target.checked)
              }
              type="checkbox"
              label="Send Keybinds"
              checked={sendKeybinds}
              style={{ color: userColor }}
            />
          </Col>
          <Col xs={3}>
            <Dropdown
              onSelect={(value) =>
                handleSelectKeybindPreset(device.slot, value || "None")
              }
            >
              <Dropdown.Toggle size="sm" variant="outline-secondary">
                Preset: {selectedPresetName}
              </Dropdown.Toggle>
              <Dropdown.Menu>
                {keybindPresetOptions.map((preset) => (
                  <Dropdown.Item key={preset} eventKey={preset}>
                    {preset}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>
          </Col>
        </Row>
      </Accordion.Header>

      <Accordion.Body>
        {selectedPresetKeybinds.length > 0 ? (
          <>
            <Row className="fw-bold small border-bottom pb-1 mb-2">
              <Col xs={6}>Key</Col>
              <Col xs={6}>Target Event</Col>
            </Row>
            {selectedPresetKeybinds.map((kb, i) => (
              <KeybindRow key={i} keybind={kb} />
            ))}
          </>
        ) : (
          <div className="text-muted small fst-italic">
            No keybinds in selected preset.
          </div>
        )}
      </Accordion.Body>
    </Accordion.Item>
  );
}
