import { useMemo } from "react";
import { Row, Col, Form, Accordion, AccordionButton } from "react-bootstrap";
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
      <div className="bg-light p-3">
        <Row className="w-100 align-items-center justify-content-between gx-2">
          <Col xs={4} className="fw-semibold">
            Slot {device.slot}: {device.name}
          </Col>

          <Col xs={2}>
            <Form.Check type="switch" reverse>
              <Form.Check.Label>enabled:</Form.Check.Label>
              <Form.Check.Input
                checked={sendKeybinds}
                onChange={(event) => {
                  event.target.blur();
                  handleSelectOutput(device.id, event.target.checked);
                }}
                style={{
                  ...(sendKeybinds && {
                    backgroundColor: userColor,
                    borderColor: userColor,
                  }),
                }}
              />
            </Form.Check>
          </Col>

          <Col
            xs={3}
            className="d-flex justify-content-center align-items-center"
          >
            <span className="me-1">Preset:</span>
            <Form.Select
              size="sm"
              value={selectedPresetName}
              onChange={(event) => {
                event.target.blur();
                const value = event.target.value;
                handleSelectKeybindPreset(device.slot, value || "None");
              }}
            >
              {keybindPresetOptions.map((preset) => (
                <option key={preset} value={preset}>
                  {preset}
                </option>
              ))}
            </Form.Select>
          </Col>

          <Col xs={"auto"}>
            <AccordionButton
              onClick={() => (document.activeElement as HTMLElement)?.blur()}
              className="w-auto p-0 bg-light shadow-none"
            />
          </Col>
        </Row>
      </div>

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
